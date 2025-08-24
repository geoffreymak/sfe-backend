import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;
export type UserStatus = 'active' | 'inactive' | 'locked' | 'invited';

@Schema({ timestamps: true })
export class User {
  @Prop({
    required: true,
    unique: true,
    index: true,
    lowercase: true,
    trim: true,
    minlength: 5,
    maxlength: 190,
  })
  email!: string;

  // Optional password hash (argon2id) when the user is active with a password
  @Prop({ required: false })
  passwordHash?: string;

  // Optional profile fields
  @Prop({ required: false, minlength: 2, maxlength: 80 })
  displayName?: string;

  @Prop({ required: false, minlength: 0, maxlength: 40 })
  phone?: string;

  @Prop({ required: false })
  avatarUrl?: string;

  @Prop({ required: false, minlength: 2, maxlength: 10 })
  locale?: string;

  @Prop({ required: false, minlength: 2, maxlength: 40 })
  timezone?: string;

  @Prop({
    required: true,
    enum: ['active', 'inactive', 'locked', 'invited'],
    default: 'active',
  })
  status!: UserStatus;

  // The user's default tenant (e.g., set on register or chosen later)
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  defaultTenantId!: Types.ObjectId;

  // Soft delete marker
  @Prop({ required: false })
  deletedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
