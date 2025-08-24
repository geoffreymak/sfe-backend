import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { MongoServerError } from 'mongodb';
import { hash as argon2hash, argon2id } from 'argon2';
import { User, UserDocument, UserStatus } from './user.schema';
import {
  Membership,
  MembershipDocument,
} from '../memberships/membership.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SetStatusDto } from './dto/set-status.dto';
import { SetRolesDto } from './dto/set-roles.dto';
import { SetDefaultTenantDto } from './dto/set-default-tenant.dto';
import { RbacService } from '../rbac/rbac.service';
import { AuditService } from '../audit/audit.service';

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type UserTimestamps = {
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
};

type LeanUser = User & { _id: Types.ObjectId } & UserTimestamps;

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Membership.name)
    private readonly membershipModel: Model<MembershipDocument>,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
  ) {}

  private toSafe<
    T extends {
      _id: Types.ObjectId;
      email: string;
      displayName?: string;
      phone?: string;
      avatarUrl?: string;
      locale?: string;
      timezone?: string;
      status: UserStatus;
      defaultTenantId: Types.ObjectId;
      createdAt?: Date;
      updatedAt?: Date;
    },
  >(u: T) {
    return {
      id: String(u._id),
      email: u.email,
      displayName: u.displayName ?? null,
      phone: u.phone ?? null,
      avatarUrl: u.avatarUrl ?? null,
      locale: u.locale ?? null,
      timezone: u.timezone ?? null,
      status: u.status,
      defaultTenantId: String(u.defaultTenantId),
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    } as const;
  }

  async create(
    dto: CreateUserDto,
    actorUserId: string,
    tenantIdFromHeader: string,
  ) {
    const email = String(dto.email).trim().toLowerCase();

    const exists = await this.userModel.exists({ email });
    if (exists) throw new ConflictException('Email already registered');

    let passwordHash: string | undefined;
    let status: UserStatus = 'invited';
    if (dto.password) {
      passwordHash = await argon2hash(dto.password, { type: argon2id });
      status = 'active';
    }

    const defaultTenantId = new Types.ObjectId(
      String(dto.defaultTenantId ?? tenantIdFromHeader),
    );

    const payload: Pick<
      User,
      | 'email'
      | 'passwordHash'
      | 'displayName'
      | 'phone'
      | 'avatarUrl'
      | 'locale'
      | 'timezone'
      | 'status'
      | 'defaultTenantId'
    > = {
      email,
      passwordHash,
      displayName: dto.displayName,
      phone: dto.phone,
      avatarUrl: dto.avatarUrl,
      locale: dto.locale,
      timezone: dto.timezone,
      status,
      defaultTenantId,
    };

    try {
      const created = await this.userModel.create(payload);

      if (dto.roles && dto.roles.length > 0) {
        await this.rbac.setMembershipRoles(
          created._id,
          tenantIdFromHeader,
          dto.roles,
        );
      }

      await this.audit.log({
        action: 'user.create',
        resource: 'user',
        resourceId: created._id,
        before: undefined,
        after: this.toSafe(created),
      });

      return this.toSafe(created);
    } catch (err: unknown) {
      if (err instanceof MongoServerError && err.code === 11000) {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }
  }

  async findAll(
    tenantId: string,
    params: {
      q?: string;
      status?: UserStatus;
      limit?: number;
      offset?: number;
    },
  ) {
    const tid = new Types.ObjectId(String(tenantId));
    const rawLimit =
      typeof params.limit === 'number' && !Number.isNaN(params.limit)
        ? params.limit
        : 20;
    const rawOffset =
      typeof params.offset === 'number' && !Number.isNaN(params.offset)
        ? params.offset
        : 0;
    const limit = Math.max(1, Math.min(100, rawLimit));
    const offset = Math.max(0, rawOffset);

    const memberUserIds = (await this.membershipModel
      .find({ tenantId: tid })
      .select({ userId: 1, _id: 0 })
      .lean()
      .exec()) as ReadonlyArray<{ userId: Types.ObjectId | string }>;
    const ids: Types.ObjectId[] = memberUserIds.map(
      (m) => new Types.ObjectId(String(m.userId)),
    );
    if (ids.length === 0)
      return { items: [], total: 0, limit, offset } as const;

    const filter: FilterQuery<User> = {
      $and: [
        { _id: { $in: ids } },
        { $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }] },
      ],
    };

    if (params.status) filter.$and!.push({ status: params.status });
    if (params.q && params.q.trim().length > 0) {
      const rx = new RegExp(escapeRegex(params.q.trim()), 'i');
      filter.$and!.push({ $or: [{ email: rx }, { displayName: rx }] });
    }

    const itemsPromise = this.userModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean()
      .exec() as Promise<LeanUser[]>;
    const totalPromise = this.userModel.countDocuments(filter).exec();

    const [items, total] = await Promise.all([itemsPromise, totalPromise]);

    return {
      items: items.map((u) => this.toSafe(u)),
      total,
      limit,
      offset,
    };
  }

  private async ensureMemberOfTenant(
    userId: Types.ObjectId,
    tenantId: Types.ObjectId,
  ) {
    const m = await this.membershipModel.findOne({ userId, tenantId }).lean();
    if (!m) throw new NotFoundException('User not found');
  }

  async findOne(userId: string, tenantId: string) {
    const uid = new Types.ObjectId(String(userId));
    const tid = new Types.ObjectId(String(tenantId));

    await this.ensureMemberOfTenant(uid, tid);

    const u = await this.userModel.findById(uid).lean<LeanUser>();
    if (!u || u.deletedAt) throw new NotFoundException('User not found');
    return this.toSafe(u);
  }

  async update(
    userId: string,
    dto: UpdateUserDto,
    actorUserId: string,
    tenantId: string,
  ) {
    const uid = new Types.ObjectId(String(userId));
    const tid = new Types.ObjectId(String(tenantId));

    await this.ensureMemberOfTenant(uid, tid);

    const u = await this.userModel.findById(uid);
    if (!u || u.deletedAt) throw new NotFoundException('User not found');

    const before = this.toSafe(u);

    const norm = (s?: string | null) => (typeof s === 'string' ? s.trim() : s);
    if (dto.displayName !== undefined)
      u.displayName = norm(dto.displayName) ?? undefined;
    if (dto.phone !== undefined) u.phone = norm(dto.phone) ?? undefined;
    if (dto.avatarUrl !== undefined)
      u.avatarUrl = norm(dto.avatarUrl) ?? undefined;
    if (dto.locale !== undefined) u.locale = norm(dto.locale) ?? undefined;
    if (dto.timezone !== undefined)
      u.timezone = norm(dto.timezone) ?? undefined;

    const saved = await u.save();

    await this.audit.log({
      action: 'user.update',
      resource: 'user',
      resourceId: uid,
      before,
      after: this.toSafe(saved),
    });

    return this.toSafe(saved);
  }

  async setStatus(
    userId: string,
    dto: SetStatusDto,
    actorUserId: string,
    tenantId: string,
  ) {
    const uid = new Types.ObjectId(String(userId));
    const tid = new Types.ObjectId(String(tenantId));

    if (String(uid) === String(actorUserId) && dto.status === 'locked') {
      throw new BadRequestException('You cannot lock yourself');
    }

    await this.ensureMemberOfTenant(uid, tid);

    const u = await this.userModel.findById(uid);
    if (!u || u.deletedAt) throw new NotFoundException('User not found');

    const before = this.toSafe(u);
    u.status = dto.status as UserStatus;
    const saved = await u.save();

    await this.audit.log({
      action: 'user.status.set',
      resource: 'user',
      resourceId: uid,
      before,
      after: this.toSafe(saved),
    });

    return this.toSafe(saved);
  }

  async softDelete(userId: string, actorUserId: string, tenantId: string) {
    const uid = new Types.ObjectId(String(userId));
    const tid = new Types.ObjectId(String(tenantId));

    if (String(uid) === String(actorUserId)) {
      throw new BadRequestException('You cannot delete yourself');
    }

    await this.ensureMemberOfTenant(uid, tid);

    const u = await this.userModel.findById(uid);
    if (!u || u.deletedAt) throw new NotFoundException('User not found');

    const before = this.toSafe(u);
    u.deletedAt = new Date();
    u.status = 'inactive';
    await u.save();

    await this.audit.log({
      action: 'user.delete.soft',
      resource: 'user',
      resourceId: uid,
      before,
      after: { deleted: true },
    });
  }

  async getRoles(userId: string, tenantId: string) {
    return this.rbac.getMembership(userId, tenantId);
  }

  async setRoles(
    userId: string,
    dto: SetRolesDto,
    actorUserId: string,
    tenantId: string,
  ) {
    const res = await this.rbac.setMembershipRoles(userId, tenantId, dto.roles);
    // Audit optional if not traced by RBAC; keep a minimal trace
    await this.audit.log({
      action: 'user.roles.set',
      resource: 'user',
      resourceId: userId,
      before: undefined,
      after: { roles: res.roles },
    });
    return res;
  }

  async setDefaultTenant(
    userId: string,
    dto: SetDefaultTenantDto,
    tenantId: string,
  ) {
    const uid = new Types.ObjectId(String(userId));
    const newTid = new Types.ObjectId(String(dto.tenantId));
    const tid = new Types.ObjectId(String(tenantId));

    // Ensure the user belongs to the current tenant context as well
    await this.ensureMemberOfTenant(uid, tid);

    // Ensure the user is member of the target tenant to set as default
    const count = await this.membershipModel.countDocuments({
      userId: uid,
      tenantId: newTid,
    });
    if (count === 0)
      throw new BadRequestException(
        'User is not a member of the target tenant',
      );

    const u = await this.userModel.findById(uid);
    if (!u || u.deletedAt) throw new NotFoundException('User not found');

    const before = this.toSafe(u);
    u.defaultTenantId = newTid;
    const saved = await u.save();

    await this.audit.log({
      action: 'user.defaultTenant.set',
      resource: 'user',
      resourceId: uid,
      before,
      after: this.toSafe(saved),
    });

    return this.toSafe(saved);
  }
}
