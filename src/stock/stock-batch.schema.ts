import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type StockBatchDocument = HydratedDocument<StockBatch>;

@Schema({ timestamps: true })
export class StockBatch {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  warehouseId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  itemId!: Types.ObjectId;

  @Prop({ type: String, required: false, index: true })
  lot?: string;

  @Prop({ type: SchemaTypes.Decimal128, required: true })
  qty!: Types.Decimal128;

  @Prop({ type: SchemaTypes.Decimal128, required: true })
  unitCost!: Types.Decimal128;

  @Prop({ type: Date })
  expiresAt?: Date;

  @Prop({ type: Date, required: true, default: () => new Date() })
  receivedAt!: Date;
}

export const StockBatchSchema = SchemaFactory.createForClass(StockBatch);

StockBatchSchema.index(
  { tenantId: 1, warehouseId: 1, itemId: 1, lot: 1, receivedAt: 1 },
  { unique: false },
);
