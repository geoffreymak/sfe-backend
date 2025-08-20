import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateWarehouseDto {
  @ApiPropertyOptional({ example: 'WH-001' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 'Entrepôt principal' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Av. 30 Juin, Kinshasa' })
  @IsOptional()
  @IsString()
  address?: string;
}
