import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  Validate,
} from 'class-validator';
import { DGI_ITEM_TYPES, DGI_TAX_GROUPS } from '../../common/dgi/dgi-constants';
import { TaxGroupForTaxValidator } from '../validators/item.validators';

export type ItemType = (typeof DGI_ITEM_TYPES)[number];
export type ItemTaxGroup = (typeof DGI_TAX_GROUPS)[number];
export type ItemStockTracking = 'none' | 'simple' | 'lot' | 'serial';

const DECIMAL_REGEX = /^-?\d+(\.\d+)?$/;

export class CreateItemDto {
  @ApiProperty({ example: 'SKU-001' })
  @IsString()
  code!: string;

  @ApiProperty({ example: 'Stylo bille bleu' })
  @IsString()
  name!: string;

  @ApiProperty({ enum: DGI_ITEM_TYPES })
  @IsEnum(DGI_ITEM_TYPES)
  type!: ItemType;

  @ApiProperty({ example: 'pcs' })
  @IsString()
  unit!: string;

  @ApiPropertyOptional({ example: '1234567890123' })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiProperty({ enum: DGI_TAX_GROUPS, description: 'A..P' })
  @IsEnum(DGI_TAX_GROUPS)
  @Validate(TaxGroupForTaxValidator)
  taxGroupDefault!: ItemTaxGroup;

  @ApiPropertyOptional({
    example: '1000.00',
    description: 'Prix HT (string number)',
  })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_REGEX)
  priceHT?: string;

  @ApiPropertyOptional({
    example: '1160.00',
    description: 'Prix TTC (string number)',
  })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_REGEX)
  priceTTC?: string;

  @ApiPropertyOptional({
    enum: ['none', 'simple', 'lot', 'serial'],
    default: 'none',
  })
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
