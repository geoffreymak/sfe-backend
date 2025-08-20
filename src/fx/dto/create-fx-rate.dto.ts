import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class CreateFxRateDto {
  @ApiProperty({ enum: ['CDF'], default: 'CDF' })
  @IsEnum(['CDF'])
  base!: 'CDF';

  @ApiProperty({ example: 'USD' })
  @IsString()
  @Length(3, 3)
  quote!: string;

  @ApiProperty({ example: '2750.50', description: 'Decimal rate as string' })
  @IsString()
  @Matches(/^\d+(\.\d+)?$/)
  rate!: string;

  @ApiProperty({
    example: new Date().toISOString(),
    description: 'ISO date-time the rate becomes valid',
  })
  @IsDateString()
  validFrom!: string;
}
