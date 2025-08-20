import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SettingsCurrencyDto {
  @ApiProperty({ enum: ['CDF'], default: 'CDF' })
  @IsString()
  base!: 'CDF';

  @ApiProperty({ example: 'USD', default: 'USD' })
  @IsString()
  defaultAlt!: string;

  @ApiProperty({ type: [String], default: [] })
  @IsArray()
  @IsString({ each: true })
  allowed!: string[];

  @ApiProperty({ example: 2, default: 2 })
  @IsInt()
  @Min(0)
  @Max(6)
  decimals!: number;

  @ApiProperty({ enum: ['HALF_UP'], default: 'HALF_UP' })
  @IsEnum(['HALF_UP'])
  rounding!: 'HALF_UP';
}

export class SettingsInvoiceNumberingDto {
  @ApiProperty({ example: 'FV', default: 'FV' })
  @IsString()
  prefix!: string;

  @ApiProperty({ example: true, default: true })
  @IsBoolean()
  yearlyReset!: boolean;

  @ApiProperty({ example: 6, default: 6 })
  @IsInt()
  @Min(1)
  @Max(12)
  width!: number;
}

export class SettingsInvoiceDto {
  @ApiProperty({ enum: ['HT', 'TTC'], default: 'TTC' })
  @IsEnum(['HT', 'TTC'])
  defaultModePrix!: 'HT' | 'TTC';

  @ApiProperty({ type: SettingsInvoiceNumberingDto })
  @ValidateNested()
  @Type(() => SettingsInvoiceNumberingDto)
  numbering!: SettingsInvoiceNumberingDto;

  @ApiProperty({ example: 24, default: 24 })
  @IsInt()
  @Min(1)
  @Max(168)
  idempotencyTTLHours!: number;
}

export class SettingsLoyaltyEarnDto {
  @ApiProperty({ enum: ['HT', 'TTC'], default: 'TTC' })
  @IsEnum(['HT', 'TTC'])
  base!: 'HT' | 'TTC';

  @ApiProperty({ example: 1, default: 1 })
  @IsNumber()
  @Min(0)
  rate!: number;

  @ApiProperty({ example: 1000, default: 1000 })
  @IsInt()
  @Min(1)
  baseUnit!: number;

  @ApiProperty({ type: [String], default: ['L', 'N'] })
  @IsArray()
  @IsString({ each: true })
  excludeTaxGroups!: string[];
}

export class SettingsLoyaltyRedeemDto {
  @ApiProperty({ example: 10, default: 10 })
  @IsNumber()
  @Min(0)
  pointValueCDF!: number;
}

export class SettingsLoyaltyDto {
  @ApiProperty({ example: false, default: false })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ type: SettingsLoyaltyEarnDto })
  @ValidateNested()
  @Type(() => SettingsLoyaltyEarnDto)
  earn!: SettingsLoyaltyEarnDto;

  @ApiProperty({ type: SettingsLoyaltyRedeemDto })
  @ValidateNested()
  @Type(() => SettingsLoyaltyRedeemDto)
  redeem!: SettingsLoyaltyRedeemDto;
}

export class SettingsStockDto {
  @ApiProperty({ enum: ['AVG', 'FIFO'], default: 'AVG' })
  @IsEnum(['AVG', 'FIFO'])
  costingMethod!: 'AVG' | 'FIFO';

  @ApiProperty({ example: false, default: false })
  @IsBoolean()
  allowNegativeStock!: boolean;

  @ApiProperty({ example: false, default: false })
  @IsBoolean()
  reservationsEnabled!: boolean;
}

export class SettingsIntegrationSafetyDto {
  @ApiProperty({ example: true, default: true })
  @IsBoolean()
  subtotalCheck!: boolean;

  @ApiProperty({ example: 120, default: 120 })
  @IsInt()
  @Min(1)
  confirmDeadlineSec!: number;

  @ApiProperty({ example: 10, default: 10 })
  @IsInt()
  @Min(0)
  pendingMax!: number;
}

export class SettingsIntegrationEmcfDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  baseUrlInfo?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  baseUrlInvoice?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  token?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  isf?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  nif?: string;
}

export class SettingsIntegrationMcfDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  port?: number;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  baud?: number;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  dataBits?: number;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  parity?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  stopBits?: number;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  isf?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  nif?: string;
}

export class SettingsIntegrationDto {
  @ApiProperty({ enum: ['emcf', 'mcf', 'mock'], default: 'mock' })
  @IsEnum(['emcf', 'mcf', 'mock'])
  mode!: 'emcf' | 'mcf' | 'mock';

  @ApiProperty({ type: SettingsIntegrationEmcfDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => SettingsIntegrationEmcfDto)
  emcf?: SettingsIntegrationEmcfDto;

  @ApiProperty({ type: SettingsIntegrationMcfDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => SettingsIntegrationMcfDto)
  mcf?: SettingsIntegrationMcfDto;

  @ApiProperty({ type: SettingsIntegrationSafetyDto })
  @ValidateNested()
  @Type(() => SettingsIntegrationSafetyDto)
  safety!: SettingsIntegrationSafetyDto;
}

export class UpdateSettingsDto {
  @ApiProperty({ type: SettingsCurrencyDto })
  @ValidateNested()
  @Type(() => SettingsCurrencyDto)
  currency!: SettingsCurrencyDto;

  @ApiProperty({ type: SettingsInvoiceDto })
  @ValidateNested()
  @Type(() => SettingsInvoiceDto)
  invoice!: SettingsInvoiceDto;

  @ApiProperty({ type: SettingsLoyaltyDto })
  @ValidateNested()
  @Type(() => SettingsLoyaltyDto)
  loyalty!: SettingsLoyaltyDto;

  @ApiProperty({ type: SettingsStockDto })
  @ValidateNested()
  @Type(() => SettingsStockDto)
  stock!: SettingsStockDto;

  @ApiProperty({ type: SettingsIntegrationDto })
  @ValidateNested()
  @Type(() => SettingsIntegrationDto)
  integration!: SettingsIntegrationDto;
}
