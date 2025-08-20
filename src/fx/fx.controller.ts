import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FxService } from './fx.service';
import { CreateFxRateDto } from './dto/create-fx-rate.dto';

@ApiTags('FX')
@ApiBearerAuth('bearer')
@Controller('fx-rates')
export class FxController {
  constructor(private readonly service: FxService) {}

  @Post()
  async create(@Body() dto: CreateFxRateDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiQuery({ name: 'quote', required: false })
  async list(@Query('quote') quote?: string) {
    return this.service.list(quote);
  }

  @Get('latest')
  @ApiQuery({ name: 'quote', required: true })
  async latest(@Query('quote') quote?: string) {
    if (!quote) throw new BadRequestException('quote is required');
    return this.service.latest(quote);
  }
}
