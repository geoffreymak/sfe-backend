import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type StockMovementDocument = HydratedDocument<StockMovement>;

export type StockMovementType =
  | 'receipt'
  | 'transfer_out'
  | 'transfer_in'
  | 'adjustment';

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class StockMovement {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: ['receipt', 'transfer_out', 'transfer_in', 'adjustment'],
  })
  type!: StockMovementType;

  @Prop({ type: SchemaTypes.ObjectId })
  warehouseId?: Types.ObjectId; // source for transfer_out or target for receipt/adjustment

  @Prop({ type: SchemaTypes.ObjectId })
  warehouseToId?: Types.ObjectId; // destination for transfers

  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  itemId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.Decimal128, required: true })
  qty!: Types.Decimal128; // positive for in, negative for out

  @Prop({ type: SchemaTypes.Decimal128 })
  unitCost?: Types.Decimal128;

  @Prop({ type: String })
  lot?: string;

  @Prop({ type: [String], default: [] })
  serials?: string[];

  @Prop({ type: SchemaTypes.ObjectId })
  invoiceId?: Types.ObjectId;

  @Prop({ type: String })
  notes?: string;

  @Prop({ type: Date, required: true, default: () => new Date() })
  createdAt!: Date;
}

export const StockMovementSchema = SchemaFactory.createForClass(StockMovement);

StockMovementSchema.index({ tenantId: 1, createdAt: -1 });
