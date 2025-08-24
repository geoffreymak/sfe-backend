import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsDefined,
  IsOptional,
  IsString,
  Matches,
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
  @IsIn(DGI_CLIENT_TYPES)
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
  @IsIn(['COR', 'RAN', 'RAM', 'RRR'])
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
  @IsIn(DGI_ITEM_TYPES)
  kind!: (typeof DGI_ITEM_TYPES)[number];

  @ApiProperty({ enum: DGI_TAX_GROUPS })
  @IsIn(DGI_TAX_GROUPS)
  group!: (typeof DGI_TAX_GROUPS)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({ description: 'quantity (string), scale 3' })
  @IsString()
  @Matches(/^-?\d+(\.\d{1,3})?$/, {
    message: 'qty must be a decimal string with up to 3 decimal places',
  })
  qty!: string;

  @ApiProperty({ description: 'unit price (string), scale 2' })
  @IsString()
  @Matches(/^-?\d+(\.\d{1,2})?$/, {
    message: 'unitPrice must be a decimal string with up to 2 decimal places',
  })
  unitPrice!: string;
}

export class CreateInvoiceDto {
  @ApiProperty({ enum: ['HT', 'TTC'] })
  @IsIn(['HT', 'TTC'])
  modePrix!: 'HT' | 'TTC';

  @ApiProperty({ enum: DGI_INVOICE_TYPES })
  @IsIn(DGI_INVOICE_TYPES)
  type!: (typeof DGI_INVOICE_TYPES)[number];

  @ApiProperty({ type: InvoiceClientDto })
  @IsDefined({ message: 'client is required' })
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
