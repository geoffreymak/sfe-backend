import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString } from 'class-validator';

export class EnrollDto {
  @ApiProperty({
    description: 'Client ObjectId',
    example: '64f0c0c0c0c0c0c0c0c0c0c0',
  })
  @IsMongoId()
  clientId!: string;

  @ApiPropertyOptional({
    description: 'Optional card identifier',
    example: 'CARD-0001',
  })
  @IsOptional()
  @IsString()
  cardId?: string;
}
