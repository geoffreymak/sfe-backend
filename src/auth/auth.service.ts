import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { argon2id, hash as argon2hash, verify as argon2verify } from 'argon2';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { User, UserDocument } from '../users/user.schema';
import { Tenant, TenantDocument } from '../tenants/tenant.schema';
import {
  Membership,
  MembershipDocument,
} from '../memberships/membership.schema';
import { RbacService } from '../rbac/rbac.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Tenant.name)
    private readonly tenantModel: Model<TenantDocument>,
    @InjectModel(Membership.name)
    private readonly membershipModel: Model<MembershipDocument>,
    private readonly rbacService: RbacService,
  ) {}

  private readonly logger = new Logger(AuthService.name);

  private slugify(input: string): string {
    return input
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }

  // Ensure collections and indexes exist before starting a transaction to avoid
  // server errors about creating collections/indexes within a transaction.
  private async ensureCollections() {
    await Promise.all([
      this.userModel.createCollection().catch(() => undefined),
      this.tenantModel.createCollection().catch(() => undefined),
      this.membershipModel.createCollection().catch(() => undefined),
    ]);
    // Also ensure indexes are built outside of any transaction.
    await Promise.all([
      this.userModel.syncIndexes().catch(() => undefined),
      this.tenantModel.syncIndexes().catch(() => undefined),
      this.membershipModel.syncIndexes().catch(() => undefined),
    ]);
  }

  // Detect when the MongoDB deployment doesn't support transactions (standalone server)
  private isTxnUnsupported(err: unknown): boolean {
    const anyErr = err as { message?: string; errmsg?: string; code?: number };
    const text =
      `${anyErr?.message ?? ''} ${anyErr?.errmsg ?? ''}`.toLowerCase();
    return text.includes(
      'transaction numbers are only allowed on a replica set member or mongos',
    );
  }

  async register(dto: RegisterDto) {
    // Warm up collections to avoid implicit collection creation inside a transaction
    await this.ensureCollections();

    const existing = await this.userModel.findOne({ email: dto.email }).lean();
    if (existing) {
      throw new BadRequestException('Email already registered');
    }

    const passwordHash = await argon2hash(dto.password, {
      type: argon2id,
    });

    const session = await this.userModel.db.startSession();
    let useTx = false;
    try {
      try {
        session.startTransaction();
        useTx = true;
      } catch (txErr) {
        // Fallback to non-transactional flow when deployment doesn't support transactions
        this.logger.warn(
          `Transactions unsupported; proceeding without transaction: ${
            txErr instanceof Error ? txErr.message : String(txErr)
          }`,
        );
      }

      // First create the tenant (so we can set defaultTenantId on user creation)
      const orgName = dto.organizationName ?? dto.email.split('@')[0];

      try {
        const tenantDocs = useTx
          ? await this.tenantModel.create(
              [
                {
                  name: orgName,
                  slug: this.slugify(orgName),
                },
              ],
              { session },
            )
          : await this.tenantModel.create([
              {
                name: orgName,
                slug: this.slugify(orgName),
              },
            ]);
        const tenant = tenantDocs[0];

        // Create the user with defaultTenantId set (required by schema)
        const userDocs = useTx
          ? await this.userModel.create(
              [
                {
                  email: dto.email,
                  passwordHash,
                  defaultTenantId: tenant._id,
                },
              ],
              { session },
            )
          : await this.userModel.create([
              {
                email: dto.email,
                passwordHash,
                defaultTenantId: tenant._id,
              },
            ]);
        const createdUser = userDocs[0];

        // membership admin-org
        if (useTx) {
          await this.membershipModel.create(
            [
              {
                userId: createdUser._id,
                tenantId: tenant._id,
                roles: ['OWNER'],
              },
            ],
            { session },
          );
        } else {
          await this.membershipModel.create([
            {
              userId: createdUser._id,
              tenantId: tenant._id,
              roles: ['OWNER'],
            },
          ]);
        }

        if (useTx) {
          await session.commitTransaction();
        }

        // Seed default roles outside the transaction to avoid implicit collection creation inside tx
        await this.rbacService.seedTenantDefaults(tenant._id);

        const accessToken = await this.jwt.signAsync({
          sub: createdUser._id.toString(),
          email: createdUser.email,
        });

        return { accessToken, tenantId: tenant._id.toString() };
      } catch (e) {
        // If the write failed because the deployment doesn't support transactions,
        // retry the whole flow without using a transaction.
        if (useTx && this.isTxnUnsupported(e)) {
          this.logger.warn(
            `Transactions unsupported during register; retrying without transaction: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
          try {
            await session.abortTransaction();
          } catch {
            // ignore
          }

          const tenantDocs2 = await this.tenantModel.create([
            { name: orgName, slug: this.slugify(orgName) },
          ]);
          const tenant2 = tenantDocs2[0];

          const userDocs2 = await this.userModel.create([
            {
              email: dto.email,
              passwordHash,
              defaultTenantId: tenant2._id,
            },
          ]);
          const createdUser2 = userDocs2[0];

          await this.membershipModel.create([
            {
              userId: createdUser2._id,
              tenantId: tenant2._id,
              roles: ['OWNER'],
            },
          ]);

          await this.rbacService.seedTenantDefaults(tenant2._id);

          const accessToken2 = await this.jwt.signAsync({
            sub: createdUser2._id.toString(),
            email: createdUser2.email,
          });
          return {
            accessToken: accessToken2,
            tenantId: tenant2._id.toString(),
          };
        }
        throw e;
      }
    } catch (e) {
      if (useTx) {
        try {
          await session.abortTransaction();
        } catch {
          // ignore abort errors
        }
      }
      throw e;
    } finally {
      await session.endSession();
    }
  }

  async login(dto: LoginDto) {
    const user = await this.userModel.findOne({ email: dto.email });
    if (!user) throw new ForbiddenException('Invalid credentials');
    if (!user.passwordHash) throw new ForbiddenException('Invalid credentials');
    const ok = await argon2verify(user.passwordHash, dto.password);
    if (!ok) throw new ForbiddenException('Invalid credentials');

    const accessToken = await this.jwt.signAsync({
      sub: user._id.toString(),
      email: user.email,
    });
    return { accessToken };
  }

  async me(userId: string) {
    const user = await this.userModel.findById(userId).lean();
    if (!user) throw new ForbiddenException('User not found');

    type MembershipLean = {
      tenantId: Types.ObjectId | string;
      roles: string[];
    };
    const memberships = await this.membershipModel
      .find({ userId: new Types.ObjectId(userId) })
      .setOptions({ skipTenant: true })
      .lean<MembershipLean[]>();

    const tenantIds = memberships.map((m) => m.tenantId as Types.ObjectId);
    type TenantLean = { _id: Types.ObjectId; name: string; slug?: string };
    const tenants = await this.tenantModel
      .find({ _id: { $in: tenantIds } })
      .lean<TenantLean[]>();

    const byId = new Map<string, TenantLean>();
    for (const t of tenants) byId.set(t._id.toString(), t);

    const resultTenants = memberships.map((m) => ({
      id: (m.tenantId as Types.ObjectId).toString(),
      name: byId.get((m.tenantId as Types.ObjectId).toString())?.name,
      slug: byId.get((m.tenantId as Types.ObjectId).toString())?.slug,
      roles: m.roles,
    }));

    return {
      user: {
        id: user._id.toString(),
        email: user.email,
        defaultTenantId: user.defaultTenantId?.toString?.() ?? null,
      },
      tenants: resultTenants,
    };
  }
}
