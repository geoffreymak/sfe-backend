import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type StockSerialDocument = HydratedDocument<StockSerial>;

@Schema({ timestamps: true })
export class StockSerial {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  warehouseId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  itemId!: Types.ObjectId;

  @Prop({ type: String, required: true, index: true })
  serial!: string;

  @Prop({ type: String, enum: ['in', 'out'], required: true, default: 'in' })
  status!: 'in' | 'out';

  @Prop({ type: Date, required: true, default: () => new Date() })
  movedAt!: Date;
}

export const StockSerialSchema = SchemaFactory.createForClass(StockSerial);

StockSerialSchema.index(
  { tenantId: 1, itemId: 1, serial: 1, status: 1 },
  { unique: false },
);
