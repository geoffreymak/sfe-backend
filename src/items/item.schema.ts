import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import {
  DGI_ITEM_GROUP_CONSTRAINTS,
  DGI_ITEM_TYPES,
  DGI_TAX_GROUPS,
} from '../common/dgi/dgi-constants';

export type ItemDocument = HydratedDocument<Item>;

export type ItemType = (typeof DGI_ITEM_TYPES)[number];
export type ItemTaxGroup = (typeof DGI_TAX_GROUPS)[number];
export type ItemStockTracking = 'none' | 'simple' | 'lot' | 'serial';

@Schema({ timestamps: true })
export class Item {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  code!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, required: true, enum: DGI_ITEM_TYPES })
  type!: ItemType;

  @Prop({ type: String, required: true })
  unit!: string;

  @Prop({ type: String })
  barcode?: string;

  @Prop({ type: String, required: true, enum: DGI_TAX_GROUPS })
  taxGroupDefault!: ItemTaxGroup; // 'A'..'P'

  @Prop({ type: SchemaTypes.Decimal128 })
  priceHT?: Types.Decimal128; // string in DTO

  @Prop({ type: SchemaTypes.Decimal128 })
  priceTTC?: Types.Decimal128; // string in DTO

  @Prop({
    type: String,
    enum: ['none', 'simple', 'lot', 'serial'],
    default: 'none',
  })
  stockTracking!: ItemStockTracking;

  @Prop({ type: SchemaTypes.Decimal128 })
  reorderPoint?: Types.Decimal128;

  @Prop({ type: SchemaTypes.Decimal128 })
  minStock?: Types.Decimal128;

  @Prop({ type: SchemaTypes.Decimal128 })
  maxStock?: Types.Decimal128;
}

export const ItemSchema = SchemaFactory.createForClass(Item);

// Unique code per tenant
ItemSchema.index({ tenantId: 1, code: 1 }, { unique: true });

// Optional: helper validation at schema level for TAX group constraint (defensive)
ItemSchema.pre('validate', function (next) {
  const self = this as unknown as {
    type?: ItemType;
    taxGroupDefault?: ItemTaxGroup;
  };
  if (self.type === 'TAX') {
    const allowed = DGI_ITEM_GROUP_CONSTRAINTS.TAX_ALLOWED_GROUPS;
    if (self.taxGroupDefault && !allowed.includes(self.taxGroupDefault)) {
      return next(new Error('For TAX items, taxGroupDefault must be L or N'));
    }
  }
  return next();
});
