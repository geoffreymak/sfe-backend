import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, index: true })
  email!: string;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: false })
  defaultTenantId?: string | Types.ObjectId;
}

export const UserSchema = SchemaFactory.createForClass(User);
