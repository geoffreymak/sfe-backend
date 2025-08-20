import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ReportsService, JournalState } from './reports.service';

class McfJournalQueryDto {
  state?: JournalState;
  page?: number;
  limit?: number;
}

class SalesSummaryQueryDto {
  from?: string; // ISO date
  to?: string; // ISO date
  groupBy?: 'day' | 'month' | 'type' | 'group';
}

@ApiTags('Reports')
@ApiBearerAuth('bearer')
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('mcf-journal')
  @ApiOperation({ summary: 'MCF/e-MCF dispatch journal' })
  @ApiQuery({
    name: 'state',
    required: false,
    enum: ['pending', 'ack', 'rejected'],
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({
    description: 'Journal page',
    schema: {
      type: 'object',
      properties: {
        page: { type: 'number' },
        limit: { type: 'number' },
        total: { type: 'number' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              number: { type: 'string' },
              status: { type: 'string' },
              type: { type: 'string' },
              securitySource: { type: 'string', nullable: true },
              state: { type: 'string' },
              attempts: { type: 'number' },
              lastError: { type: 'string', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      example: {
        page: 1,
        limit: 50,
        total: 1,
        items: [
          {
            id: '662f...abc',
            number: 'FV/2025/000001',
            status: 'CONFIRMED',
            type: 'FC',
            securitySource: 'emcf',
            state: 'ack',
            attempts: 2,
            lastError: null,
            createdAt: '2025-01-20T10:00:00.000Z',
            updatedAt: '2025-01-20T10:05:12.000Z',
          },
        ],
      },
    },
  })
  async mcfJournal(@Query() q: McfJournalQueryDto) {
    return this.service.mcfJournal({
      state: q.state,
      page: q.page,
      limit: q.limit,
    });
  }

  @Get('sales-summary')
  @ApiOperation({ summary: 'Sales summary (confirmed invoices)' })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    description: 'ISO date',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    description: 'ISO date',
  })
  @ApiQuery({
    name: 'groupBy',
    required: false,
    enum: ['day', 'month', 'type', 'group'],
    description: 'Grouping dimension',
  })
  @ApiOkResponse({
    description: 'Summary totals and top lists',
    schema: {
      type: 'object',
      properties: {
        summary: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              totalTTC: { type: 'string' },
              count: { type: 'number' },
            },
          },
        },
        totals: {
          type: 'object',
          properties: {
            totalTTC: { type: 'string' },
            count: { type: 'number' },
          },
        },
        topItems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              totalTTC: { type: 'string' },
            },
          },
        },
        topClients: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              nif: { type: 'string', nullable: true },
              totalTTC: { type: 'string' },
            },
          },
        },
      },
      example: {
        summary: [
          { key: '2025-01-20', totalTTC: '120000.00', count: 3 },
          { key: '2025-01-21', totalTTC: '80000.00', count: 2 },
        ],
        totals: { totalTTC: '200000.00', count: 5 },
        topItems: [
          { label: 'Biscuit 50g', totalTTC: '70000.00' },
          { label: 'Coca 50cl', totalTTC: '50000.00' },
        ],
        topClients: [
          { name: 'ACME SA', nif: 'A1234567', totalTTC: '150000.00' },
          { name: 'John Doe', nif: null, totalTTC: '50000.00' },
        ],
      },
    },
  })
  async salesSummary(@Query() q: SalesSummaryQueryDto) {
    return this.service.salesSummary({
      from: q.from,
      to: q.to,
      groupBy: q.groupBy,
    });
  }
}
