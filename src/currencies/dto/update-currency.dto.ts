import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateCurrencyDto {
  @ApiPropertyOptional({ example: 'Euro' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '€' })
  @IsOptional()
  @IsString()
  symbol?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
