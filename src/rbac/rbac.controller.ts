import { BadRequestException, Controller, Get, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiTags } from '@nestjs/swagger';
import {
  PERMISSION_CATALOG,
  type PermissionEntry,
} from '../common/rbac/permission-catalog';
import { RbacService } from './rbac.service';
import { RoleCreateDto } from './dto/role-create.dto';
import { RoleUpdateDto } from './dto/role-update.dto';
import { SetRolesDto } from './dto/set-roles.dto';
import { Request } from 'express';
import { Body, Delete, Param, Patch, Post, Put } from '@nestjs/common';

@ApiTags('RBAC')
@ApiBearerAuth('bearer')
@ApiExtraModels(RoleCreateDto, RoleUpdateDto, SetRolesDto)
@Controller('rbac')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('permissions/catalog')
  listPermissions(): ReadonlyArray<PermissionEntry> {
    return PERMISSION_CATALOG;
  }

  @Get('roles')
  async listRoles(
    @Req() req: Request & { tenantId?: string },
  ): Promise<unknown> {
    return this.rbacService.listRoles(req.tenantId!);
  }

  @Post('roles')
  async createRole(
    @Req() req: Request & { tenantId?: string },
    @Body() dto: RoleCreateDto,
  ): Promise<unknown> {
    return this.rbacService.createRole(req.tenantId!, dto);
  }

  @Patch('roles/:id')
  async updateRole(
    @Req() req: Request & { tenantId?: string },
    @Param('id') id: string,
    @Body() dto: RoleUpdateDto,
  ): Promise<unknown> {
    return this.rbacService.updateRole(req.tenantId!, id, dto);
  }

  @Delete('roles/:id')
  async deleteRole(
    @Req() req: Request & { tenantId?: string },
    @Param('id') id: string,
  ): Promise<void> {
    await this.rbacService.deleteRole(req.tenantId!, id);
  }

  @Get('users/:userId/memberships/:tenantId')
  async getMembershipByPath(
    @Param('userId') userId: string,
    @Param('tenantId') tenantId: string,
  ): Promise<{ roles: string[] }> {
    return this.rbacService.getMembership(userId, tenantId);
  }

  @Put('users/:userId/memberships/:tenantId/roles')
  async setMembershipRolesByPath(
    @Param('userId') userId: string,
    @Param('tenantId') tenantId: string,
    @Body() body: SetRolesDto,
  ): Promise<{ roles: string[] }> {
    return this.rbacService.setMembershipRoles(userId, tenantId, body.roles);
  }

  @Get('me/roles')
  async myRoles(
    @Req() req: Request & { tenantId?: string; user?: { sub?: string } },
  ): Promise<{ roles: string[] }> {
    const userId = req.user?.sub;
    const tenantId = req.tenantId;
    if (!userId || !tenantId) {
      throw new BadRequestException('Missing user context or tenant id');
    }
    return this.rbacService.getMembership(userId, tenantId);
  }

  @Get('me/permissions')
  async myPermissions(
    @Req() req: Request & { tenantId?: string; user?: { sub?: string } },
  ): Promise<{ permissions: string[] }> {
    const userId = req.user?.sub;
    const tenantId = req.tenantId;
    if (!userId || !tenantId) {
      throw new BadRequestException('Missing user context or tenant id');
    }
    const { roles } = await this.rbacService.getMembership(userId, tenantId);
    if (!roles || roles.length === 0) return { permissions: [] };
    const allRoles = (await this.rbacService.listRoles(tenantId)) as Array<{
      key: string;
      permissions?: string[];
    }>;
    const needed = new Set(roles);
    const perms = new Set<string>();
    for (const r of allRoles) {
      if (needed.has(r.key)) {
        for (const p of r.permissions || []) perms.add(p);
      }
    }
    return { permissions: Array.from(perms) };
  }

  @Post('roles/seed-defaults')
  async seedDefaults(
    @Req() req: Request & { tenantId?: string },
  ): Promise<{ ok: true }> {
    await this.rbacService.seedTenantDefaults(req.tenantId!);
    return { ok: true };
  }
}
