import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { ClientType } from '../client.schema';

export class QueryClientsDto {
  @ApiPropertyOptional({ description: 'Search query', example: 'ACME' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: ['PP', 'PM', 'PC', 'PL', 'AO'] })
  @IsOptional()
  @IsEnum(['PP', 'PM', 'PC', 'PL', 'AO'])
  type?: ClientType;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
