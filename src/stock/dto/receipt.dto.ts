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

export class ReceiptLineDto {
  @ApiProperty({ example: '64f0c1b2b3c4d5e6f7a8b9c0' })
  @IsMongoId()
  itemId!: string;

  @ApiProperty({ example: '10.0', description: 'string decimal' })
  @IsString()
  @Matches(DECIMAL_REGEX)
  qty!: string;

  @ApiProperty({
    required: false,
    example: '100.00',
    description: 'string decimal',
  })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_REGEX)
  unitCost?: string;

  @ApiProperty({ required: false, example: 'LOT-2025-08' })
  @IsOptional()
  @IsString()
  lot?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serials?: string[];
}

export class ReceiptDto {
  @ApiProperty({ example: '64f0c1b2b3c4d5e6f7a8b9c0' })
  @IsMongoId()
  warehouseId!: string;

  @ApiProperty({ type: [ReceiptLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineDto)
  lines!: ReceiptLineDto[];
}
