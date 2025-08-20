import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import {
  Membership,
  MembershipDocument,
} from '../memberships/membership.schema';
import { setTenantId } from '../common/logger/request-context';
import { SKIP_TENANT_GUARD } from '../common/decorators/skip-tenant.decorator';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(Membership.name)
    private readonly membershipModel: Model<MembershipDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const skipTenant = this.reflector.getAllAndOverride<boolean>(
      SKIP_TENANT_GUARD,
      [context.getHandler(), context.getClass()],
    );
    if (skipTenant) return true;

    type AuthReq = Request & { user?: { sub?: string }; tenantId?: string };
    const req = context.switchToHttp().getRequest<AuthReq>();

    // If not authenticated, let JwtAuthGuard handle 401
    if (!req.user) return true;

    const rawTenantId = req.header('X-Tenant-Id');
    if (!rawTenantId)
      throw new BadRequestException('X-Tenant-Id header is required');

    let tenantId: Types.ObjectId;
    try {
      tenantId = new Types.ObjectId(rawTenantId);
    } catch {
      throw new BadRequestException('X-Tenant-Id must be a valid ObjectId');
    }

    const userId = new Types.ObjectId(String(req.user.sub));

    const membership = await this.membershipModel
      .findOne({ userId, tenantId })
      .lean();
    if (!membership)
      throw new ForbiddenException('User is not a member of this tenant');

    // attach to request and ALS
    req.tenantId = tenantId.toString();
    setTenantId(tenantId.toString());

    return true;
  }
}
