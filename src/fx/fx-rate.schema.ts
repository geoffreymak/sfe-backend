import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type FxRateDocument = HydratedDocument<FxRate>;

@Schema({ timestamps: true })
export class FxRate {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: String, default: 'CDF', enum: ['CDF'] })
  base!: 'CDF';

  @Prop({
    type: String,
    required: true,
    uppercase: true,
    minlength: 3,
    maxlength: 3,
  })
  quote!: string; // e.g., USD, EUR

  @Prop({ type: SchemaTypes.Decimal128, required: true })
  rate!: Types.Decimal128; // Decimal128

  @Prop({ type: String, default: 'manual', enum: ['manual'] })
  provider!: 'manual';

  @Prop({ type: Date, required: true, index: true })
  validFrom!: Date;
}

export const FxRateSchema = SchemaFactory.createForClass(FxRate);
FxRateSchema.index({ tenantId: 1, quote: 1, validFrom: -1 });
