import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MembershipDocument = HydratedDocument<Membership>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Membership {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: string | Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId!: string | Types.ObjectId;

  @Prop({ type: [String], default: [] })
  roles!: string[];
}

export const MembershipSchema = SchemaFactory.createForClass(Membership);
MembershipSchema.index({ userId: 1, tenantId: 1 }, { unique: true });
