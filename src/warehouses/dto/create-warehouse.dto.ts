import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateWarehouseDto {
  @ApiProperty({ example: 'WH-001' })
  @IsString()
  code!: string;

  @ApiProperty({ example: 'Entrepôt principal' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'Av. 30 Juin, Kinshasa' })
  @IsOptional()
  @IsString()
  address?: string;
}
