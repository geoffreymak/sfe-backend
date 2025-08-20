import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AuditLog {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: false, index: true })
  actorId?: Types.ObjectId;

  @Prop({ type: String, required: true, index: true })
  action!: string;

  @Prop({ type: String, required: true, index: true })
  resource!: string;

  @Prop({ type: SchemaTypes.ObjectId, required: false, index: true })
  resourceId?: Types.ObjectId;

  @Prop({ type: String })
  beforeHash?: string;

  @Prop({ type: String })
  afterHash?: string;

  @Prop({ type: String })
  requestId?: string;

  @Prop({ type: Date, index: true })
  createdAt!: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Append-only protection
const appendOnlyError = function (
  this: unknown,
  next: (err?: unknown) => void,
) {
  next(new Error('AuditLog is append-only'));
};
AuditLogSchema.pre('updateOne', appendOnlyError);
AuditLogSchema.pre('findOneAndUpdate', appendOnlyError);
AuditLogSchema.pre('deleteOne', appendOnlyError);
AuditLogSchema.pre('deleteMany', appendOnlyError);
AuditLogSchema.pre('findOneAndDelete', appendOnlyError);
AuditLogSchema.pre('findOneAndRemove', appendOnlyError);
