import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ROLES_KEY, Role } from '../common/decorators/roles.decorator';
import {
  Membership,
  MembershipDocument,
} from '../memberships/membership.schema';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(Membership.name)
    private readonly membershipModel: Model<MembershipDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: { sub?: string } }>();
    if (!req.user?.sub) return false; // JwtAuthGuard should handle 401

    const rawTenantId = req.header('X-Tenant-Id');
    if (!rawTenantId) return false;

    let tenantId: Types.ObjectId;
    try {
      tenantId = new Types.ObjectId(rawTenantId);
    } catch {
      return false;
    }

    const userId = new Types.ObjectId(String(req.user.sub));
    const membership = await this.membershipModel
      .findOne({ userId, tenantId })
      .lean();
    if (!membership) return false;

    const has = (membership.roles || []).some((r) => roles.includes(r));
    if (!has) throw new ForbiddenException('Insufficient role');
    return true;
  }
}
