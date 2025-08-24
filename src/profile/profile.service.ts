import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { hash as argon2hash, verify as argon2verify, argon2id } from 'argon2';
import { User, UserDocument } from '../users/user.schema';
import { AuditService } from '../audit/audit.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getTenantId, setTenantId } from '../common/logger/request-context';

@Injectable()
export class ProfileService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly audit: AuditService,
  ) {}

  private toSafe(u: UserDocument | (User & { _id: Types.ObjectId })) {
    return {
      id: String(u._id),
      email: u.email,
      displayName: u.displayName ?? null,
      phone: u.phone ?? null,
      avatarUrl: u.avatarUrl ?? null,
      locale: u.locale ?? null,
      timezone: u.timezone ?? null,
      createdAt: (u as unknown as { createdAt?: Date }).createdAt,
    } as const;
  }

  async getMeProfile(userId: string) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');
    return this.toSafe(user);
  }

  async updateMeProfile(userId: string, dto: UpdateProfileDto) {
    const u = await this.userModel.findById(userId).exec();
    if (!u) throw new NotFoundException('User not found');

    const before = this.toSafe(u);

    // normalize inputs
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
      action: 'profile.update',
      resource: 'user',
      resourceId: u._id,
      before,
      after: this.toSafe(saved),
    });

    return this.toSafe(saved);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const u = await this.userModel.findById(userId);
    if (!u) throw new NotFoundException('User not found');

    // Ensure a password is set before verifying
    if (!u.passwordHash) {
      throw new BadRequestException('Current password is invalid');
    }
    const ok = await argon2verify(u.passwordHash, dto.currentPassword);
    if (!ok) throw new BadRequestException('Current password is invalid');
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must be different');
    }

    u.passwordHash = await argon2hash(dto.newPassword, { type: argon2id });
    await u.save();

    // Ensure tenant context exists for audit when SkipTenantGuard is used
    const tid =
      getTenantId() ??
      (u.defaultTenantId ? String(u.defaultTenantId) : undefined);
    if (tid) setTenantId(tid);

    await this.audit.log({
      action: 'profile.password.change',
      resource: 'user',
      resourceId: u._id,
      before: { passwordChanged: false },
      after: { passwordChanged: true },
    });

    return { changed: true } as const;
  }
}
