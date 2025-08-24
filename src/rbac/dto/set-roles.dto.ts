import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString, Matches } from 'class-validator';

export class SetRolesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[A-Z0-9:_-]{3,64}$/, { each: true })
  roles!: string[];
}
