import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type ClientDocument = HydratedDocument<Client>;

export type ClientType = 'PP' | 'PM' | 'PC' | 'PL' | 'AO';

@Schema({ _id: false })
export class ClientLoyalty {
  @Prop({ type: Boolean, default: false })
  enrolled!: boolean;

  @Prop({ type: String })
  cardId?: string;

  @Prop({ type: String })
  tier?: string;

  @Prop({ type: Number, default: 0, min: 0 })
  points!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  totalEarned!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  totalRedeemed!: number;

  @Prop({ type: Date })
  lastActivityAt?: Date;

  @Prop({ type: Date })
  enrolledAt?: Date;

  @Prop({
    type: SchemaTypes.Decimal128,
    default: () => new Types.Decimal128('0'),
  })
  lifetimeValue!: Types.Decimal128; // Decimal128

  @Prop({ type: Boolean, default: false })
  optInMarketing?: boolean;
}

@Schema({ timestamps: true })
export class Client {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ['PP', 'PM', 'PC', 'PL', 'AO'] })
  type!: ClientType;

  @Prop({ type: String })
  displayName?: string;

  @Prop({ type: String })
  denomination?: string; // PM

  @Prop({ type: String })
  name?: string; // PP/PC/PL/AO

  @Prop({ type: String })
  nif?: string;

  @Prop({ type: String })
  refExo?: string; // AO

  @Prop({ type: String })
  email?: string;

  @Prop({ type: String })
  phone?: string;

  @Prop({ type: ClientLoyalty, default: {} })
  loyalty!: ClientLoyalty;
}

export const ClientSchema = SchemaFactory.createForClass(Client);
ClientSchema.index({ tenantId: 1, email: 1 });
ClientSchema.index({ tenantId: 1, phone: 1 });
ClientSchema.index({ tenantId: 1, nif: 1 });
