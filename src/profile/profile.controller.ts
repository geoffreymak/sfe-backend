import { Body, Controller, Get, Patch, Put, Req } from '@nestjs/common';
import { HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SkipTenantGuard } from '../common/decorators/skip-tenant.decorator';
import { RbacService } from '../rbac/rbac.service';

@ApiTags('Profile')
@ApiBearerAuth('bearer')
@Controller('me')
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly rbacService: RbacService,
  ) {}

  // Requires JWT + TenantGuard
  @Get('profile')
  async getProfile(@Req() req: Request & { user?: { sub?: string } }) {
    return this.profileService.getMeProfile(req.user!.sub!);
  }

  // Requires JWT + TenantGuard
  @Put('profile')
  async updateProfile(
    @Req() req: Request & { user?: { sub?: string } },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profileService.updateMeProfile(req.user!.sub!, dto);
  }

  // Requires JWT, SkipTenantGuard to allow without X-Tenant-Id; audit will use default tenant
  @SkipTenantGuard()
  @Patch('password')
  @HttpCode(204)
  async changePassword(
    @Req() req: Request & { user?: { sub?: string } },
    @Body() dto: ChangePasswordDto,
  ) {
    await this.profileService.changePassword(req.user!.sub!, dto);
    return;
  }

  // Proxy endpoints to RBAC
  @Get('roles')
  async myRoles(
    @Req() req: Request & { tenantId?: string; user?: { sub?: string } },
  ): Promise<{ roles: string[] }> {
    return this.rbacService.getMembership(req.user!.sub!, req.tenantId!);
  }

  @Get('permissions')
  async myPermissions(
    @Req() req: Request & { tenantId?: string; user?: { sub?: string } },
  ): Promise<{ permissions: string[] }> {
    const { roles } = await this.rbacService.getMembership(
      req.user!.sub!,
      req.tenantId!,
    );
    if (!roles || roles.length === 0) return { permissions: [] };
    const allRoles = (await this.rbacService.listRoles(
      req.tenantId!,
    )) as Array<{
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
}
