import {
  BadRequestException,
  ForbiddenException,
  Injectable,
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

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Tenant.name)
    private readonly tenantModel: Model<TenantDocument>,
    @InjectModel(Membership.name)
    private readonly membershipModel: Model<MembershipDocument>,
  ) {}

  private slugify(input: string): string {
    return input
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }

  async register(dto: RegisterDto) {
    const existing = await this.userModel.findOne({ email: dto.email }).lean();
    if (existing) {
      throw new BadRequestException('Email already registered');
    }

    const passwordHash = await argon2hash(dto.password, {
      type: argon2id,
    });

    const session = await this.userModel.db.startSession();
    session.startTransaction();
    try {
      const user = await this.userModel.create(
        [
          {
            email: dto.email,
            passwordHash,
          },
        ],
        { session },
      );
      const createdUser = user[0];

      const orgName = dto.organizationName ?? dto.email.split('@')[0];
      const tenantDocs = await this.tenantModel.create(
        [
          {
            name: orgName,
            slug: this.slugify(orgName),
          },
        ],
        { session },
      );
      const tenant = tenantDocs[0];

      // membership admin-org
      await this.membershipModel.create(
        [
          {
            userId: createdUser._id,
            tenantId: tenant._id,
            roles: ['admin-org'],
          },
        ],
        { session },
      );

      // set default tenant
      createdUser.defaultTenantId = tenant._id;
      await createdUser.save({ session });

      await session.commitTransaction();

      const accessToken = await this.jwt.signAsync({
        sub: createdUser._id.toString(),
        email: createdUser.email,
      });

      return { accessToken, tenantId: tenant._id.toString() };
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      await session.endSession();
    }
  }

  async login(dto: LoginDto) {
    const user = await this.userModel.findOne({ email: dto.email });
    if (!user) throw new ForbiddenException('Invalid credentials');
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
