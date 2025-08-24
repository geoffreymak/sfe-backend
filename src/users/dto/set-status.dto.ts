import { IsIn } from 'class-validator';

export class SetStatusDto {
  @IsIn(['active', 'inactive', 'locked', 'invited'])
  status!: 'active' | 'inactive' | 'locked' | 'invited';
}
