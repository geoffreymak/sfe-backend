import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import {
  DGI_TAX_GROUPS,
  DGI_ITEM_TYPES,
  DGI_INVOICE_TYPES,
} from '../common/dgi/dgi-constants';

export type InvoiceDocument = HydratedDocument<Invoice>;

export type InvoiceStatus = 'DRAFT' | 'CONFIRMED';
export type InvoiceModePrix = 'HT' | 'TTC';
export type InvoiceType = (typeof DGI_INVOICE_TYPES)[number];
export type LineKind = (typeof DGI_ITEM_TYPES)[number];
export type LineGroup = (typeof DGI_TAX_GROUPS)[number];

@Schema({ _id: false })
export class InvoiceClientSnapshot {
  @Prop({ type: String, required: true, enum: ['PP', 'PM', 'PC', 'PL', 'AO'] })
  type!: 'PP' | 'PM' | 'PC' | 'PL' | 'AO';

  @Prop({ type: String })
  denomination?: string; // PM

  @Prop({ type: String })
  name?: string; // PP/PC/PL/AO

  @Prop({ type: String })
  nif?: string;

  @Prop({ type: String })
  refExo?: string; // AO
}

@Schema({ _id: false })
export class InvoiceLine {
  @Prop({ type: SchemaTypes.ObjectId })
  itemId?: Types.ObjectId;

  @Prop({ type: String, enum: DGI_ITEM_TYPES, required: true })
  kind!: LineKind; // BIE | SER | TAX

  @Prop({ type: String, enum: DGI_TAX_GROUPS, required: true })
  group!: LineGroup; // 'A'..'P'

  @Prop({ type: String })
  label?: string;

  @Prop({ type: SchemaTypes.Decimal128, required: true })
  qty!: Types.Decimal128; // Decimal128

  @Prop({ type: SchemaTypes.Decimal128, required: true })
  unitPrice!: Types.Decimal128; // Decimal128

  @Prop({ type: SchemaTypes.Decimal128, required: true })
  totalHT!: Types.Decimal128; // Decimal128

  @Prop({ type: SchemaTypes.Decimal128, required: true })
  totalVAT!: Types.Decimal128; // Decimal128

  @Prop({ type: SchemaTypes.Decimal128, required: true })
  totalTTC!: Types.Decimal128; // Decimal128
}

@Schema({ _id: false })
export class InvoiceTotals {
  @Prop({ type: SchemaTypes.Decimal128, required: true })
  ht!: Types.Decimal128;

  @Prop({ type: SchemaTypes.Decimal128, required: true })
  vat!: Types.Decimal128;

  @Prop({ type: SchemaTypes.Decimal128, required: true })
  ttc!: Types.Decimal128;
}

@Schema({ _id: false })
export class InvoiceEquivalentCurrency {
  @Prop({
    type: String,
    required: true,
    uppercase: true,
    minlength: 3,
    maxlength: 3,
  })
  code!: string; // e.g. USD

  @Prop({ type: SchemaTypes.Decimal128, required: true })
  rate!: Types.Decimal128; // CDF per 1 unit of quote

  @Prop({ type: String, default: 'manual', enum: ['manual'] })
  provider!: 'manual';

  @Prop({ type: Date, required: true })
  at!: Date; // rate validFrom
}

@Schema({ _id: false })
export class InvoiceAvoirMeta {
  @Prop({ type: String, enum: ['COR', 'RAN', 'RAM', 'RRR'] })
  nature?: 'COR' | 'RAN' | 'RAM' | 'RRR';

  @Prop({ type: String })
  originInvoiceRef?: string;
}

@Schema({ _id: false })
export class InvoiceSecurityQR {
  @Prop({ type: String })
  payload?: string;
}

@Schema({ _id: false })
export class InvoiceSecurity {
  @Prop({ type: String, enum: ['emcf', 'mcf'] })
  source!: 'emcf' | 'mcf';

  @Prop({ type: String })
  codeDefDgi!: string; // e.g. SIG

  @Prop({ type: String })
  nimOrMid!: string; // e-MCF NIM or MCF MID

  @Prop({ type: String })
  counters?: string; // e.g. FC/TC

  @Prop({ type: Date })
  certifiedAt!: Date;

  @Prop({ type: InvoiceSecurityQR })
  qr?: InvoiceSecurityQR;
}

@Schema({ _id: false })
export class InvoiceEmcf {
  @Prop({ type: String })
  uid?: string;

  // e-MCF echoed totals or payload
  // Using Mixed to allow flexible shape
  @Prop({ type: SchemaTypes.Mixed })
  totalsFromEmcf?: unknown;

  @Prop({ type: String, enum: ['POSTED', 'CONFIRMED', 'CANCELED'] })
  lastAction?: 'POSTED' | 'CONFIRMED' | 'CANCELED';
}

@Schema({ _id: false })
export class InvoiceMcf {
  @Prop({ type: String })
  lastCmd?: string;

  @Prop({ type: String })
  dt?: string;

  @Prop({ type: String })
  mid?: string;

  @Prop({ type: String })
  sig?: string;
}

@Schema({ _id: false })
export class InvoiceDispatch {
  @Prop({
    type: String,
    enum: ['pending', 'ack', 'rejected'],
    default: 'pending',
  })
  state!: 'pending' | 'ack' | 'rejected';

  @Prop({ type: Number, default: 0, min: 0 })
  attempts!: number;

  @Prop({ type: String })
  lastError?: string;
}

@Schema({ timestamps: true })
export class Invoice {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: String, enum: ['DRAFT', 'CONFIRMED'], default: 'DRAFT' })
  status!: InvoiceStatus;

  @Prop({ type: String, enum: ['HT', 'TTC'], required: true })
  modePrix!: InvoiceModePrix;

  @Prop({ type: String, required: true, enum: DGI_INVOICE_TYPES })
  type!: InvoiceType;

  @Prop({ type: String, unique: false })
  number?: string;

  @Prop({ type: InvoiceClientSnapshot, required: true })
  client!: InvoiceClientSnapshot;

  @Prop({ type: [InvoiceLine], default: [] })
  lines!: InvoiceLine[];

  @Prop({ type: InvoiceTotals, required: true })
  totals!: InvoiceTotals;

  @Prop({ type: InvoiceEquivalentCurrency })
  equivalentCurrency?: InvoiceEquivalentCurrency;

  @Prop({ type: InvoiceAvoirMeta })
  avoir?: InvoiceAvoirMeta;

  @Prop({ type: InvoiceSecurity })
  security?: InvoiceSecurity;

  @Prop({ type: InvoiceEmcf })
  emcf?: InvoiceEmcf;

  @Prop({ type: InvoiceMcf })
  mcf?: InvoiceMcf;

  @Prop({ type: InvoiceDispatch })
  dispatch?: InvoiceDispatch;

  // Timestamps added by Mongoose (timestamps: true)
  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);
InvoiceSchema.index({ tenantId: 1, number: 1 }, { unique: true, sparse: true });

// Simple counters for numbering
@Schema({ collection: 'invoice_counters' })
export class InvoiceCounter {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: DGI_INVOICE_TYPES })
  type!: InvoiceType;

  @Prop({ type: Number, required: true })
  year!: number;

  @Prop({ type: Number, required: true, default: 0 })
  seq!: number;
}
export type InvoiceCounterDocument = HydratedDocument<InvoiceCounter>;
export const InvoiceCounterSchema =
  SchemaFactory.createForClass(InvoiceCounter);
InvoiceCounterSchema.index({ tenantId: 1, type: 1, year: 1 }, { unique: true });
