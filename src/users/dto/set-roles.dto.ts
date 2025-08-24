import { ArrayNotEmpty, ArrayUnique, IsArray, Matches } from 'class-validator';

export class SetRolesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @Matches(/^[A-Z0-9:_-]{3,64}$/, { each: true })
  roles!: string[]; // RBAC keys for current tenant
}
