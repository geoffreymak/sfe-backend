import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  DGI_CLIENT_TYPES,
  DGI_INVOICE_TYPES,
  DGI_ITEM_TYPES,
  DGI_TAX_GROUPS,
} from '../../common/dgi/dgi-constants';

export class InvoiceClientDto {
  @ApiProperty({ enum: DGI_CLIENT_TYPES })
  @IsEnum(DGI_CLIENT_TYPES)
  type!: (typeof DGI_CLIENT_TYPES)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  denomination?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  nif?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  refExo?: string;
}

export class InvoiceAvoirDto {
  @ApiProperty({ required: false, enum: ['COR', 'RAN', 'RAM', 'RRR'] })
  @IsOptional()
  @IsEnum(['COR', 'RAN', 'RAM', 'RRR'])
  nature?: 'COR' | 'RAN' | 'RAM' | 'RRR';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  originInvoiceRef?: string;
}

export class InvoiceLineDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  itemId?: string;

  @ApiProperty({ enum: DGI_ITEM_TYPES })
  @IsEnum(DGI_ITEM_TYPES)
  kind!: (typeof DGI_ITEM_TYPES)[number];

  @ApiProperty({ enum: DGI_TAX_GROUPS })
  @IsEnum(DGI_TAX_GROUPS)
  group!: (typeof DGI_TAX_GROUPS)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({ description: 'quantity (string), scale 3' })
  @IsString()
  qty!: string;

  @ApiProperty({ description: 'unit price (string), scale 2' })
  @IsString()
  unitPrice!: string;
}

export class CreateInvoiceDto {
  @ApiProperty({ enum: ['HT', 'TTC'] })
  @IsEnum(['HT', 'TTC'])
  modePrix!: 'HT' | 'TTC';

  @ApiProperty({ enum: DGI_INVOICE_TYPES })
  @IsEnum(DGI_INVOICE_TYPES)
  type!: (typeof DGI_INVOICE_TYPES)[number];

  @ApiProperty({ type: InvoiceClientDto })
  @ValidateNested()
  @Type(() => InvoiceClientDto)
  client!: InvoiceClientDto;

  @ApiProperty({ type: [InvoiceLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines!: InvoiceLineDto[];

  @ApiProperty({ required: false, type: InvoiceAvoirDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => InvoiceAvoirDto)
  avoir?: InvoiceAvoirDto;
}
