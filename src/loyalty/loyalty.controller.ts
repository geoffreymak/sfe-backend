import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { LoyaltyService } from './loyalty.service';
import { EnrollDto } from './dto/enroll.dto';
import { RedeemDto } from './dto/redeem.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';

@ApiTags('Loyalty')
@ApiBearerAuth('bearer')
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly service: LoyaltyService) {}

  @Post('enroll')
  @ApiBody({
    type: EnrollDto,
    examples: {
      enroll: {
        summary: 'Enroll client',
        value: { clientId: '64f0c0c0c0c0c0c0c0c0c0c0', cardId: 'CARD-0001' },
      },
    },
  })
  async enroll(@Body() dto: EnrollDto) {
    return this.service.enroll(dto);
  }

  @Post('redeem')
  @ApiBody({
    type: RedeemDto,
    examples: {
      redeem: {
        summary: 'Redeem 100 points',
        value: {
          clientId: '64f0c0c0c0c0c0c0c0c0c0c0',
          points: 100,
          reason: 'Reward redemption',
          idempotencyKey: 'redeem-INV-2025-000123',
        },
      },
    },
  })
  async redeem(@Body() dto: RedeemDto) {
    return this.service.redeem(dto);
  }

  @Get('transactions')
  @ApiOkResponse({ description: 'List loyalty transactions for a client' })
  async list(@Query() q: QueryTransactionsDto) {
    return this.service.transactions(q);
  }
}
