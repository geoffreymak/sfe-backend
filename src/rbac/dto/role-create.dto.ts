import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  Matches,
  Length,
  MaxLength,
  ArrayNotEmpty,
} from 'class-validator';

export class RoleCreateDto {
  @ApiProperty({ example: 'MANAGER' })
  @IsString()
  @Matches(/^[A-Z0-9:_-]{3,64}$/)
  key!: string;

  @ApiProperty({ example: 'manager' })
  @IsString()
  @Length(2, 80)
  name!: string;

  @ApiPropertyOptional({ example: 'Can manage core resources' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  description?: string;

  @ApiProperty({
    type: [String],
    example: ['items:read', 'invoices:create'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permissions!: string[];
}
