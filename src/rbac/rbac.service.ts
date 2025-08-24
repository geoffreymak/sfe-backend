import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Logger } from 'nestjs-pino';
import { MongoServerError } from 'mongodb';
import { Role, RoleDocument } from './schemas/role.schema';
import {
  PERMISSION_CATALOG,
  type PermissionKey,
} from '../common/rbac/permission-catalog';
import {
  Membership,
  MembershipDocument,
} from '../memberships/membership.schema';

@Injectable()
export class RbacService {
  constructor(
    @InjectModel(Role.name)
    private readonly roleModel: Model<RoleDocument>,
    @InjectModel(Membership.name)
    private readonly membershipModel: Model<MembershipDocument>,
    private readonly logger: Logger,
  ) {}

  // Catalog
  listCatalog() {
    return PERMISSION_CATALOG;
  }

  // Roles
  async listRoles(tenantId: string | Types.ObjectId) {
    const tid = new Types.ObjectId(String(tenantId));
    return this.roleModel
      .find({ tenantId: tid })
      .select({ __v: 0 })
      .lean()
      .exec();
  }

  private validatePermissionsSubset(
    perms: string[] | undefined,
  ): asserts perms is PermissionKey[] {
    if (!perms) return;
    const allowed = new Set<PermissionKey>(
      PERMISSION_CATALOG.map((p) => p.key),
    );
    const invalid = new Set<string>();
    for (const k of perms) {
      if (typeof k !== 'string' || !allowed.has(k as PermissionKey)) {
        invalid.add(String(k));
      }
    }
    if (invalid.size > 0) {
      throw new BadRequestException(
        `permissions contains invalid keys: ${Array.from(invalid).join(', ')}`,
      );
    }
  }

  async createRole(
    tenantId: string | Types.ObjectId,
    dto: {
      key: string;
      name: string;
      description?: string;
      permissions: string[];
    },
  ) {
    const tid = new Types.ObjectId(String(tenantId));
    const key = String(dto.key).trim().toUpperCase();

    // service-level guard even if DTO/schema already restrict
    this.validatePermissionsSubset(dto.permissions);

    const exists = await this.roleModel.exists({ tenantId: tid, key });
    if (exists) {
      throw new ConflictException('Role key already exists for this tenant');
    }

    try {
      const created = await this.roleModel.create({
        tenantId: tid,
        key,
        name: dto.name,
        description: dto.description,
        permissions: dto.permissions,
        system: false,
        immutable: false,
      });
      this.logger.log(
        {
          event: 'rbac.role.create',
          tenantId: tid.toString(),
          key,
          roleId: created._id.toString(),
        },
        'Role created',
      );
      return created.toObject();
    } catch (err: unknown) {
      // duplicate key fallback
      if (err instanceof MongoServerError && err.code === 11000) {
        throw new ConflictException('Role key already exists for this tenant');
      }
      throw err;
    }
  }

  async updateRole(
    tenantId: string | Types.ObjectId,
    roleId: string | Types.ObjectId,
    dto: { name?: string; description?: string; permissions?: string[] },
  ) {
    const tid = new Types.ObjectId(String(tenantId));
    const rid = new Types.ObjectId(String(roleId));

    const role = await this.roleModel
      .findOne({ _id: rid, tenantId: tid })
      .exec();
    if (!role) throw new NotFoundException('Role not found');
    if (role.immutable === true) {
      throw new ForbiddenException('Cannot update an immutable role');
    }

    if (dto.permissions) this.validatePermissionsSubset(dto.permissions);

    role.name = dto.name ?? role.name;
    role.description = dto.description ?? role.description;
    if (dto.permissions) role.permissions = dto.permissions;

    const saved = await role.save();
    this.logger.log(
      {
        event: 'rbac.role.update',
        tenantId: tid.toString(),
        roleId: saved._id.toString(),
        key: saved.key,
      },
      'Role updated',
    );
    return saved.toObject();
  }

  async deleteRole(
    tenantId: string | Types.ObjectId,
    roleId: string | Types.ObjectId,
  ): Promise<void> {
    const tid = new Types.ObjectId(String(tenantId));
    const rid = new Types.ObjectId(String(roleId));
    const role = await this.roleModel
      .findOne({ _id: rid, tenantId: tid })
      .lean();
    if (!role) throw new NotFoundException('Role not found');
    if (role.system || role.immutable) {
      throw new ForbiddenException('Cannot delete system or immutable role');
    }
    await this.roleModel.deleteOne({ _id: rid, tenantId: tid }).exec();
    this.logger.log(
      {
        event: 'rbac.role.delete',
        tenantId: tid.toString(),
        roleId: rid.toString(),
        key: role.key,
      },
      'Role deleted',
    );
  }

  // Memberships
  async getMembership(
    userId: string | Types.ObjectId,
    tenantId: string | Types.ObjectId,
  ): Promise<{ roles: string[] }> {
    const uid = new Types.ObjectId(String(userId));
    const tid = new Types.ObjectId(String(tenantId));
    const m = await this.membershipModel
      .findOne({ userId: uid, tenantId: tid })
      .lean()
      .exec();
    return { roles: m?.roles ?? [] };
  }

  async setMembershipRoles(
    userId: string | Types.ObjectId,
    tenantId: string | Types.ObjectId,
    roles: string[],
  ): Promise<{ roles: string[] }> {
    const uid = new Types.ObjectId(String(userId));
    const tid = new Types.ObjectId(String(tenantId));
    const uniqueKeys = Array.from(
      new Set(roles.map((r) => String(r).trim().toUpperCase())),
    );

    if (uniqueKeys.length > 0) {
      const count = await this.roleModel.countDocuments({
        tenantId: tid,
        key: { $in: uniqueKeys },
      });
      if (count !== uniqueKeys.length) {
        // find missing keys
        const existing = await this.roleModel
          .find({ tenantId: tid, key: { $in: uniqueKeys } })
          .select({ key: 1, _id: 0 })
          .lean();
        const have = new Set(existing.map((e) => e.key));
        const missing = uniqueKeys.filter((k) => !have.has(k));
        throw new BadRequestException(
          `Unknown role keys for tenant: ${missing.join(', ')}`,
        );
      }
    }

    await this.membershipModel
      .updateOne(
        { userId: uid, tenantId: tid },
        { $set: { roles: uniqueKeys } },
        { upsert: true },
      )
      .exec();

    this.logger.log(
      {
        event: 'rbac.membership.roles.set',
        tenantId: tid.toString(),
        userId: uid.toString(),
        roles: uniqueKeys,
      },
      'Membership roles set',
    );

    return { roles: uniqueKeys };
  }

  // Seed defaults per tenant
  async seedTenantDefaults(tenantId: string | Types.ObjectId): Promise<void> {
    const tid = new Types.ObjectId(String(tenantId));
    const allPerms = PERMISSION_CATALOG.map((p) => p.key);

    const ensure = async (
      key: string,
      name: string,
      permissions: PermissionKey[],
      flags?: { system?: boolean; immutable?: boolean },
    ) => {
      const exists = await this.roleModel.exists({ tenantId: tid, key });
      if (exists) return;
      await this.roleModel.create({
        tenantId: tid,
        key,
        name,
        permissions,
        system: !!flags?.system,
        immutable: !!flags?.immutable,
      });
    };

    const READ_BASE = [
      'users:read',
      'roles:read',
      'clients:read',
      'items:read',
      'stock:read',
      'invoices:read',
      'invoices:pdf',
      'settings:read',
      'reports:view',
      'audit:view',
    ] as PermissionKey[];

    const CASHIER = [
      'clients:read',
      'loyalty:redeem',
      'items:read',
      'stock:read',
      'invoices:read',
      'invoices:create',
      'invoices:confirm',
      'invoices:pdf',
    ] as PermissionKey[];

    const MANAGER = Array.from(
      new Set<PermissionKey>([
        ...CASHIER,
        'clients:create',
        'clients:update',
        'clients:delete',
        'items:create',
        'items:update',
        'stock:receipt',
        'stock:transfer',
        'stock:adjust',
        'invoices:cancel',
        'roles:read',
        'settings:read',
        'reports:view',
      ] as PermissionKey[]),
    );

    const ADMIN = allPerms;

    await ensure('OWNER', 'Owner', allPerms, { system: true, immutable: true });
    await ensure('ADMIN', 'Admin', ADMIN, { system: true });
    await ensure('MANAGER', 'Manager', MANAGER);
    await ensure('CASHIER', 'Cashier', CASHIER);
    await ensure('VIEWER', 'Viewer', READ_BASE);
  }
}
