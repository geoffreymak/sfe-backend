import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrenciesService } from './currencies.service';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';

@ApiTags('Currencies')
@ApiBearerAuth('bearer')
@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly service: CurrenciesService) {}

  @Get()
  async list() {
    return this.service.list();
  }

  @Post()
  async create(@Body() dto: CreateCurrencyDto) {
    return this.service.create(dto);
  }

  @Patch(':code')
  async update(@Param('code') code: string, @Body() dto: UpdateCurrencyDto) {
    return this.service.update(code, dto);
  }

  @Delete(':code')
  async remove(@Param('code') code: string) {
    await this.service.delete(code);
    return { deleted: true };
  }
}
