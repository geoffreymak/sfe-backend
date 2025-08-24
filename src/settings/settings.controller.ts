import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { getTenantId } from '../common/logger/request-context';
import { Public } from '../common/decorators/public.decorator';
import { SkipTenantGuard } from '../common/decorators/skip-tenant.decorator';
import type { PublicSettings } from './settings.service';

@ApiTags('Settings')
@ApiBearerAuth('bearer')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async get(): Promise<unknown> {
    const tenantId = getTenantId();
    if (!tenantId) throw new BadRequestException('Missing tenant context');
    return this.settingsService.get(tenantId);
  }

  @Put()
  @Roles('OWNER', 'ADMIN')
  async put(@Body() dto: UpdateSettingsDto): Promise<unknown> {
    const tenantId = getTenantId();
    if (!tenantId) throw new BadRequestException('Missing tenant context');
    return this.settingsService.update(tenantId, dto);
  }

  @Get('public')
  @Public()
  @SkipTenantGuard()
  async getPublic(
    @Headers('x-tenant-id') tenantId?: string,
  ): Promise<PublicSettings> {
    if (!tenantId) throw new BadRequestException('Missing X-Tenant-Id header');
    return this.settingsService.getPublic(tenantId);
  }
}
