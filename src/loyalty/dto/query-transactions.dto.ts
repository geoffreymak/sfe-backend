import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsMongoId, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryTransactionsDto {
  @ApiProperty({
    description: 'Client ObjectId',
    example: '64f0c0c0c0c0c0c0c0c0c0c0',
  })
  @IsMongoId()
  clientId!: string;

  @ApiProperty({ default: 1, minimum: 1, required: false })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({ default: 20, minimum: 1, required: false })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 20;
}
