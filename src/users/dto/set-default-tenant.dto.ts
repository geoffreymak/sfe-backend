import { IsMongoId } from 'class-validator';

export class SetDefaultTenantDto {
  @IsMongoId()
  tenantId!: string; // new default tenant id
}
