import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import type { ClientType } from '../client.schema';

export class CreateClientDto {
  @ApiProperty({ enum: ['PP', 'PM', 'PC', 'PL', 'AO'] })
  @IsEnum(['PP', 'PM', 'PC', 'PL', 'AO'])
  type!: ClientType;

  @ApiPropertyOptional({ example: 'ACME SARL' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ example: 'ACME SARL' })
  @IsOptional()
  @IsString()
  denomination?: string;

  @ApiPropertyOptional({ example: 'Jean Kabila' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'A1234567C' })
  @IsOptional()
  @IsString()
  nif?: string;

  @ApiPropertyOptional({ example: 'EXO-12345' })
  @IsOptional()
  @IsString()
  refExo?: string;

  @ApiPropertyOptional({ example: 'client@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+243811234567' })
  @IsOptional()
  @IsString()
  phone?: string;
}
