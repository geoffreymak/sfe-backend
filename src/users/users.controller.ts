import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SetStatusDto } from './dto/set-status.dto';
import { SetRolesDto } from './dto/set-roles.dto';
import { SetDefaultTenantDto } from './dto/set-default-tenant.dto';

@ApiTags('Users (Admin)')
@ApiBearerAuth('bearer')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list(
    @Req() req: Request & { tenantId?: string },
    @Query('q') q?: string,
    @Query('status') status?: 'active' | 'inactive' | 'locked' | 'invited',
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.users.findAll(req.tenantId!, {
      q,
      status,
      limit: Number(limit),
      offset: Number(offset),
    });
  }

  @Post()
  async create(
    @Req() req: Request & { tenantId?: string; user?: { sub?: string } },
    @Body() dto: CreateUserDto,
  ) {
    return this.users.create(dto, String(req.user?.sub), req.tenantId!);
  }

  @Get(':id')
  async getOne(
    @Req() req: Request & { tenantId?: string },
    @Param('id') id: string,
  ) {
    return this.users.findOne(id, req.tenantId!);
  }

  @Patch(':id')
  async update(
    @Req() req: Request & { tenantId?: string; user?: { sub?: string } },
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(id, dto, String(req.user?.sub), req.tenantId!);
  }

  @Put(':id/status')
  async setStatus(
    @Req() req: Request & { tenantId?: string; user?: { sub?: string } },
    @Param('id') id: string,
    @Body() dto: SetStatusDto,
  ) {
    return this.users.setStatus(id, dto, String(req.user?.sub), req.tenantId!);
  }

  @Delete(':id')
  async softDelete(
    @Req() req: Request & { tenantId?: string; user?: { sub?: string } },
    @Param('id') id: string,
  ) {
    await this.users.softDelete(id, String(req.user?.sub), req.tenantId!);
    return { deleted: true } as const;
  }

  @Get(':id/roles')
  async getRoles(
    @Req() req: Request & { tenantId?: string },
    @Param('id') id: string,
  ) {
    const { roles } = await this.users.getRoles(id, req.tenantId!);
    return roles;
  }

  @Put(':id/roles')
  async setRoles(
    @Req() req: Request & { tenantId?: string; user?: { sub?: string } },
    @Param('id') id: string,
    @Body() dto: SetRolesDto,
  ) {
    return this.users.setRoles(id, dto, String(req.user?.sub), req.tenantId!);
  }

  @Put(':id/default-tenant')
  async setDefaultTenant(
    @Req() req: Request & { tenantId?: string },
    @Param('id') id: string,
    @Body() dto: SetDefaultTenantDto,
  ) {
    return this.users.setDefaultTenant(id, dto, req.tenantId!);
  }
}
