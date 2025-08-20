import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const DECIMAL_REGEX = /^-?\d+(\.\d+)?$/;

export class AdjustmentLineDto {
  @ApiProperty({ example: '64f0c1b2b3c4d5e6f7a8b9c0' })
  @IsMongoId()
  itemId!: string;

  @ApiProperty({
    example: '-2.0',
    description: 'Delta quantity, string decimal',
  })
  @IsString()
  @Matches(DECIMAL_REGEX)
  qtyDelta!: string;

  @ApiProperty({ example: 'stock count correction' })
  @IsString()
  reason!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  lot?: string;
}

export class AdjustmentDto {
  @ApiProperty({ example: '64f0c1b2b3c4d5e6f7a8b9c0' })
  @IsMongoId()
  warehouseId!: string;

  @ApiProperty({ type: [AdjustmentLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdjustmentLineDto)
  lines!: AdjustmentLineDto[];
}
