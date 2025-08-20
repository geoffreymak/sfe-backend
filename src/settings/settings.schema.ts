import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type SettingsDocument = HydratedDocument<Settings>;

@Schema({ _id: false })
export class SettingsCurrency {
  @Prop({ type: String, default: 'CDF', immutable: true })
  base!: 'CDF';

  @Prop({ type: String, default: 'USD' })
  defaultAlt!: string;

  @Prop({ type: [String], default: [] })
  allowed!: string[];

  @Prop({ type: Number, default: 2, min: 0, max: 6 })
  decimals!: number;

  @Prop({ type: String, default: 'HALF_UP', enum: ['HALF_UP'] })
  rounding!: 'HALF_UP';
}

@Schema({ _id: false })
export class SettingsInvoiceNumbering {
  @Prop({ type: String, default: 'FV' })
  prefix!: string;

  @Prop({ type: Boolean, default: true })
  yearlyReset!: boolean;

  @Prop({ type: Number, default: 6, min: 1, max: 12 })
  width!: number;
}

@Schema({ _id: false })
export class SettingsInvoice {
  @Prop({ type: String, default: 'TTC', enum: ['HT', 'TTC'] })
  defaultModePrix!: 'HT' | 'TTC';

  @Prop({ type: SettingsInvoiceNumbering })
  numbering!: SettingsInvoiceNumbering;

  @Prop({ type: Number, default: 24, min: 1, max: 168 })
  idempotencyTTLHours!: number;
}

@Schema({ _id: false })
export class SettingsLoyaltyEarn {
  @Prop({ type: String, default: 'TTC', enum: ['HT', 'TTC'] })
  base!: 'HT' | 'TTC';

  @Prop({ type: Number, default: 1, min: 0 })
  rate!: number;

  @Prop({ type: Number, default: 1000, min: 1 })
  baseUnit!: number;

  @Prop({ type: [String], default: ['L', 'N'] })
  excludeTaxGroups!: string[];
}

@Schema({ _id: false })
export class SettingsLoyaltyRedeem {
  @Prop({ type: Number, default: 10, min: 0 })
  pointValueCDF!: number;
}

@Schema({ _id: false })
export class SettingsLoyalty {
  @Prop({ type: Boolean, default: false })
  enabled!: boolean;

  @Prop({ type: SettingsLoyaltyEarn })
  earn!: SettingsLoyaltyEarn;

  @Prop({ type: SettingsLoyaltyRedeem })
  redeem!: SettingsLoyaltyRedeem;
}

@Schema({ _id: false })
export class SettingsStock {
  @Prop({ type: String, default: 'AVG', enum: ['AVG', 'FIFO'] })
  costingMethod!: 'AVG' | 'FIFO';

  @Prop({ type: Boolean, default: false })
  allowNegativeStock!: boolean;

  @Prop({ type: Boolean, default: false })
  reservationsEnabled!: boolean;
}

@Schema({ _id: false })
export class SettingsIntegrationSafety {
  @Prop({ type: Boolean, default: true })
  subtotalCheck!: boolean;

  @Prop({ type: Number, default: 120, min: 1 })
  confirmDeadlineSec!: number;

  @Prop({ type: Number, default: 10, min: 0 })
  pendingMax!: number;
}

@Schema({ _id: false })
export class SettingsIntegrationEmcf {
  @Prop({ type: String })
  baseUrlInfo?: string;
  @Prop({ type: String })
  baseUrlInvoice?: string;
  @Prop({ type: String })
  token?: string; // secret - should be stripped in public view
  @Prop({ type: String })
  isf?: string;
  @Prop({ type: String })
  nif?: string;
}

@Schema({ _id: false })
export class SettingsIntegrationMcf {
  @Prop({ type: Number })
  port?: number;
  @Prop({ type: Number })
  baud?: number;
  @Prop({ type: Number })
  dataBits?: number;
  @Prop({ type: String })
  parity?: string;
  @Prop({ type: Number })
  stopBits?: number;
  @Prop({ type: String })
  isf?: string;
  @Prop({ type: String })
  nif?: string;
}

@Schema({ _id: false })
export class SettingsIntegration {
  @Prop({ type: String, default: 'mock', enum: ['emcf', 'mcf', 'mock'] })
  mode!: 'emcf' | 'mcf' | 'mock';

  @Prop({ type: SettingsIntegrationEmcf })
  emcf?: SettingsIntegrationEmcf;

  @Prop({ type: SettingsIntegrationMcf })
  mcf?: SettingsIntegrationMcf;

  @Prop({ type: SettingsIntegrationSafety })
  safety!: SettingsIntegrationSafety;
}

@Schema({ timestamps: true })
export class Settings {
  @Prop({
    type: SchemaTypes.ObjectId,
    required: true,
    index: true,
    unique: true,
  })
  tenantId!: Types.ObjectId;

  @Prop({ type: SettingsCurrency })
  currency!: SettingsCurrency;

  @Prop({ type: SettingsInvoice })
  invoice!: SettingsInvoice;

  @Prop({ type: SettingsLoyalty })
  loyalty!: SettingsLoyalty;

  @Prop({ type: SettingsStock })
  stock!: SettingsStock;

  @Prop({ type: SettingsIntegration })
  integration!: SettingsIntegration;
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);
SettingsSchema.index({ tenantId: 1 }, { unique: true });
