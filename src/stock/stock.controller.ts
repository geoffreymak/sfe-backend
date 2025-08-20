import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { StockService } from './stock.service';
import { ReceiptDto } from './dto/receipt.dto';
import { TransferDto } from './dto/transfer.dto';
import { AdjustmentDto } from './dto/adjustment.dto';

@ApiTags('Stock')
@ApiBearerAuth('bearer')
@Controller('stock')
export class StockController {
  constructor(private readonly service: StockService) {}

  @Post('receipts')
  @ApiCreatedResponse({ description: 'Stock receipt processed' })
  async receipts(@Body() dto: ReceiptDto) {
    return this.service.receipts(dto);
  }

  @Post('transfers')
  @ApiCreatedResponse({ description: 'Stock transfer processed' })
  async transfers(@Body() dto: TransferDto) {
    return this.service.transfers(dto);
  }

  @Post('adjustments')
  @ApiCreatedResponse({ description: 'Stock adjustment processed' })
  async adjustments(@Body() dto: AdjustmentDto) {
    return this.service.adjustments(dto);
  }

  @Get('alerts')
  @ApiOkResponse({ description: 'Low stock alerts' })
  async alerts() {
    return this.service.alerts();
  }
}
