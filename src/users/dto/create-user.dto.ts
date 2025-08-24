import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsMongoId,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  @MaxLength(190)
  email!: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  displayName?: string;

  @IsOptional()
  @IsString()
  @Length(5, 40)
  phone?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @Length(2, 10)
  locale?: string;

  @IsOptional()
  @IsString()
  @Length(2, 40)
  timezone?: string;

  // If absent => status = 'invited'
  @IsOptional()
  @IsString()
  @Length(12, 128)
  password?: string;

  // Default tenant at creation (e.g., manual add by admin)
  @IsOptional()
  @IsMongoId()
  defaultTenantId?: string;

  // Roles to assign (RBAC keys) for the current tenant X-Tenant-Id
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Matches(/^[A-Z0-9:_-]{3,64}$/, { each: true })
  roles?: string[];
}
