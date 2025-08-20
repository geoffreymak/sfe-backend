import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  Validate,
  ValidateIf,
} from 'class-validator';
import { DGI_ITEM_TYPES, DGI_TAX_GROUPS } from '../../common/dgi/dgi-constants';
import {
  PricesXorValidator,
  TaxGroupForTaxValidator,
} from '../validators/item.validators';

export type ItemType = (typeof DGI_ITEM_TYPES)[number];
export type ItemTaxGroup = (typeof DGI_TAX_GROUPS)[number];
export type ItemStockTracking = 'none' | 'simple' | 'lot' | 'serial';

const DECIMAL_REGEX = /^-?\d+(\.\d+)?$/;

export class UpdateItemDto {
  @ApiPropertyOptional({ example: 'SKU-001' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 'Stylo bille bleu' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: DGI_ITEM_TYPES })
  @IsOptional()
  @IsEnum(DGI_ITEM_TYPES)
  type?: ItemType;

  @ApiPropertyOptional({ example: 'pcs' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ example: '1234567890123' })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional({ enum: DGI_TAX_GROUPS, description: 'A..P' })
  @IsOptional()
  @IsEnum(DGI_TAX_GROUPS)
  @Validate(TaxGroupForTaxValidator)
  taxGroupDefault?: ItemTaxGroup;

  @ApiPropertyOptional({ example: '1000.00' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_REGEX)
  @ValidateIf((o: UpdateItemDto) => o.priceTTC != null && o.priceTTC !== '')
  @Validate(PricesXorValidator)
  priceHT?: string;

  @ApiPropertyOptional({ example: '1160.00' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_REGEX)
  @ValidateIf((o: UpdateItemDto) => o.priceHT != null && o.priceHT !== '')
  @Validate(PricesXorValidator)
  priceTTC?: string;

  @ApiPropertyOptional({ enum: ['none', 'simple', 'lot', 'serial'] })
  @IsOptional()
  @IsEnum(['none', 'simple', 'lot', 'serial'])
  stockTracking?: ItemStockTracking;

  @ApiPropertyOptional({ example: '10' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_REGEX)
  reorderPoint?: string;

  @ApiPropertyOptional({ example: '0' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_REGEX)
  minStock?: string;

  @ApiPropertyOptional({ example: '100' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_REGEX)
  maxStock?: string;
}
