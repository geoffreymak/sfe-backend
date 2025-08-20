import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class CreateCurrencyDto {
  @ApiProperty({ example: 'EUR' })
  @IsString()
  @Length(3, 3)
  code!: string;

  @ApiProperty({ example: 'Euro' })
  @IsString()
  name!: string;

  @ApiProperty({ example: '€', required: false })
  @IsOptional()
  @IsString()
  symbol?: string;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
