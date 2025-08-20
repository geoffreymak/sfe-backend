import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type LoyaltyTransactionDocument = HydratedDocument<LoyaltyTransaction>;

export type LoyaltyTxType = 'earn' | 'redeem' | 'adjust';

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class LoyaltyTransaction {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  clientId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ['earn', 'redeem', 'adjust'] })
  type!: LoyaltyTxType;

  @Prop({ type: Number, required: true, min: 0 })
  points!: number;

  @Prop({ type: String })
  reason?: string;

  @Prop({ type: SchemaTypes.ObjectId })
  invoiceId?: Types.ObjectId;

  @Prop({ type: String })
  idempotencyKey?: string;
}

export const LoyaltyTransactionSchema =
  SchemaFactory.createForClass(LoyaltyTransaction);
LoyaltyTransactionSchema.index(
  { tenantId: 1, idempotencyKey: 1 },
  { unique: true, sparse: true },
);
