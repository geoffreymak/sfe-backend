import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type StockDocument = HydratedDocument<Stock>;

@Schema({ timestamps: true })
export class Stock {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  warehouseId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  itemId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.Decimal128, required: true, default: '0' })
  qty!: Types.Decimal128;

  @Prop({ type: SchemaTypes.Decimal128, required: true, default: '0' })
  avgUnitCost!: Types.Decimal128; // Used when costingMethod = AVG
}

export const StockSchema = SchemaFactory.createForClass(Stock);

StockSchema.index({ tenantId: 1, warehouseId: 1, itemId: 1 }, { unique: true });
