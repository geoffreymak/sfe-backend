import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsMongoId,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const DECIMAL_REGEX = /^-?\d+(\.\d+)?$/;

export class TransferLineDto {
  @ApiProperty({ example: '64f0c1b2b3c4d5e6f7a8b9c0' })
  @IsMongoId()
  itemId!: string;

  @ApiProperty({ example: '5.0', description: 'string decimal' })
  @IsString()
  @Matches(DECIMAL_REGEX)
  qty!: string;

  @ApiProperty({ required: false })
  @IsString()
  lot?: string;
}

export class TransferDto {
  @ApiProperty({ example: '64f0c1b2b3c4d5e6f7a8b9c0' })
  @IsMongoId()
  fromWarehouseId!: string;

  @ApiProperty({ example: '64f0c1b2b3c4d5e6f7a8b9c1' })
  @IsMongoId()
  toWarehouseId!: string;

  @ApiProperty({ type: [TransferLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines!: TransferLineDto[];
}
