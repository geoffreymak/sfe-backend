import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import {
  PERMISSION_CATALOG,
  type PermissionKey,
} from '../../common/rbac/permission-catalog';

export type RoleDocument = HydratedDocument<Role>;

@Schema({ timestamps: true })
export class Role {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    minlength: 3,
    maxlength: 64,
    match: /^[A-Z0-9:_-]{3,64}$/,
  })
  key!: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 80,
  })
  name!: string;

  @Prop({ type: String, maxlength: 256 })
  description?: string;

  @Prop({
    type: [String],
    default: [],
    validate: {
      validator: (arr?: unknown) => {
        const allowed = new Set(PERMISSION_CATALOG.map((p) => p.key));
        return (
          Array.isArray(arr) &&
          arr.every(
            (k) => typeof k === 'string' && allowed.has(k as PermissionKey),
          )
        );
      },
      message: 'permissions contains an invalid permission key',
    },
  })
  permissions!: PermissionKey[];

  @Prop({ type: Boolean, default: false })
  system!: boolean;

  @Prop({ type: Boolean, default: false })
  immutable?: boolean;
}

export const RoleSchema = SchemaFactory.createForClass(Role);
RoleSchema.index({ tenantId: 1, key: 1 }, { unique: true });
