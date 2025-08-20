import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TenantDocument = HydratedDocument<Tenant>;

@Schema({ timestamps: true })
export class Tenant {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: false, unique: true, sparse: true })
  slug?: string;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);
