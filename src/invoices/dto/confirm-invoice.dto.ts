import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class EquivalentCurrencyDto {
  @ApiProperty({
    description: 'Currency code (quote) like USD',
    example: 'USD',
  })
  @IsString()
  code!: string;
}

export class ConfirmInvoiceDto {
  @ApiProperty({ required: false, type: EquivalentCurrencyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EquivalentCurrencyDto)
  equivalentCurrency?: EquivalentCurrencyDto;
}
