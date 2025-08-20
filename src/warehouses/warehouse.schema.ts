import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type WarehouseDocument = HydratedDocument<Warehouse>;

@Schema({ timestamps: true })
export class Warehouse {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  code!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String })
  address?: string;
}

export const WarehouseSchema = SchemaFactory.createForClass(Warehouse);

// Unique code per tenant
WarehouseSchema.index({ tenantId: 1, code: 1 }, { unique: true });
