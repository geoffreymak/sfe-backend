import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DGI_ITEM_TYPES, DGI_TAX_GROUPS } from '../../common/dgi/dgi-constants';

export class QueryItemsDto {
  @ApiPropertyOptional({
    description: 'Search in code, name, barcode',
    example: 'STYLO',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: DGI_ITEM_TYPES })
  @IsOptional()
  @IsEnum(DGI_ITEM_TYPES)
  type?: (typeof DGI_ITEM_TYPES)[number];

  @ApiPropertyOptional({ enum: DGI_TAX_GROUPS })
  @IsOptional()
  @IsEnum(DGI_TAX_GROUPS)
  taxGroup?: (typeof DGI_TAX_GROUPS)[number];

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
