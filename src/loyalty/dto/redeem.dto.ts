import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsMongoId,
  IsPositive,
  IsString,
  Length,
} from 'class-validator';

export class RedeemDto {
  @ApiProperty({
    description: 'Client ObjectId',
    example: '64f0c0c0c0c0c0c0c0c0c0c0',
  })
  @IsMongoId()
  clientId!: string;

  @ApiProperty({ description: 'Points to redeem', example: 100 })
  @IsInt()
  @IsPositive()
  points!: number;

  @ApiProperty({ description: 'Reason', example: 'Reward redemption' })
  @IsString()
  reason!: string;

  @ApiProperty({
    description: 'Idempotency key',
    example: 'redeem-INV-2025-000123',
  })
  @IsString()
  @Length(1, 128)
  idempotencyKey!: string;
}
