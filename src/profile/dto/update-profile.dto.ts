import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, Length } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 80 })
  @IsOptional()
  @IsString()
  @Length(2, 80)
  displayName?: string;

  @ApiPropertyOptional({ minLength: 5, maxLength: 40 })
  @IsOptional()
  @IsString()
  @Length(5, 40)
  phone?: string;

  @ApiPropertyOptional({ format: 'uri' })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 10 })
  @IsOptional()
  @IsString()
  @Length(2, 10)
  locale?: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 40 })
  @IsOptional()
  @IsString()
  @Length(2, 40)
  timezone?: string;
}
