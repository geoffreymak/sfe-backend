import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type CurrencyDocument = HydratedDocument<Currency>;

@Schema({ timestamps: true })
export class Currency {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    uppercase: true,
    minlength: 3,
    maxlength: 3,
  })
  code!: string; // e.g., CDF, USD, EUR

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String })
  symbol?: string;

  @Prop({ type: Boolean, default: false })
  isBase!: boolean; // only CDF can be base

  @Prop({ type: Boolean, default: false })
  isDefaultAlt!: boolean; // USD should be the default alt

  @Prop({ type: Boolean, default: true })
  enabled!: boolean;
}

export const CurrencySchema = SchemaFactory.createForClass(Currency);
CurrencySchema.index({ tenantId: 1, code: 1 }, { unique: true });
