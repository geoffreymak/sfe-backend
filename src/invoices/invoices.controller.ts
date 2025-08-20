import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Res,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ConfirmInvoiceDto } from './dto/confirm-invoice.dto';
import { getTenantId } from '../common/logger/request-context';
import { SettingsService } from '../settings/settings.service';
import { createHash } from 'node:crypto';
import { PdfService } from '../pdf/pdf.service';
import type { Response } from 'express';

// In-memory idempotency cache with TTL (per tenant)
const idemCache = new Map<string, { value: unknown; expiresAt: number }>();

function cacheKey(tenantId: string, invoiceId: string, idemKey: string) {
  return `${tenantId}:${invoiceId}:${idemKey}`;
}

@ApiTags('Invoices')
@ApiBearerAuth('bearer')
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly service: InvoicesService,
    private readonly settings: SettingsService,
    private readonly pdf: PdfService,
  ) {}

  @Post('draft')
  @ApiOperation({ summary: 'Create invoice draft and compute totals' })
  @ApiOkResponse({ description: 'Draft created' })
  @ApiBadRequestResponse({ description: 'Validation error' })
  @ApiBody({ type: CreateInvoiceDto })
  async draft(@Body() dto: CreateInvoiceDto) {
    const doc = await this.service.createDraft(dto);
    return doc.toObject();
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Confirm draft invoice with DGI checks' })
  @ApiHeader({ name: 'X-Idempotency-Key', required: false })
  @ApiOkResponse({ description: 'Invoice confirmed (idempotent)' })
  async confirm(
    @Param('id') id: string,
    @Body() dto: ConfirmInvoiceDto,
    @Headers('x-idempotency-key') idemKey?: string,
  ) {
    const tenantId = getTenantId();
    const ttlHours = (await this.settings.get(tenantId!)).invoice
      ?.idempotencyTTLHours;
    const expiresAt = Date.now() + (ttlHours ?? 24) * 3600 * 1000;

    if (idemKey) {
      const key = cacheKey(tenantId!, id, idemKey);
      const cached = idemCache.get(key);
      if (cached && cached.expiresAt > Date.now()) return cached.value;
      const res = await this.service.confirm(id, {
        equivalentCurrencyCode: dto?.equivalentCurrency?.code,
      });
      const obj = res.toObject();
      idemCache.set(key, { value: obj, expiresAt });
      return obj;
    }

    const res = await this.service.confirm(id, {
      equivalentCurrencyCode: dto?.equivalentCurrency?.code,
    });
    return res.toObject();
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Get invoice by id' })
  async get(@Param('id') id: string) {
    const doc = await this.service.get(id);
    return doc.toObject();
  }

  @Get()
  @ApiOkResponse({ description: 'List invoices' })
  async list(@Query('page') page?: string, @Query('limit') limit?: string) {
    const p = page ? Number(page) : 1;
    const l = limit ? Number(limit) : 20;
    return this.service.list(p, l);
  }

  @Get(':id/normalized')
  @ApiOkResponse({ description: 'Get normalized payload with sha256' })
  async normalized(@Param('id') id: string) {
    const inv = await this.service.get(id);
    const obj = inv.toObject() as unknown as {
      _id: unknown;
      number?: string;
      status: 'DRAFT' | 'CONFIRMED';
      type: string;
      modePrix: 'HT' | 'TTC';
      client: unknown;
      totals: unknown;
      equivalentCurrency?: unknown;
      createdAt: Date;
      updatedAt: Date;
    };
    const normalized = {
      id: String(obj._id as any),
      number: obj.number,
      status: obj.status,
      type: obj.type,
      modePrix: obj.modePrix,
      client: obj.client,
      totals: obj.totals,
      equivalentCurrency: obj.equivalentCurrency,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
    const json = JSON.stringify(normalized);
    const sha256 = createHash('sha256').update(json).digest('hex');
    return { normalized, sha256 };
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Generate invoice PDF' })
  @ApiOkResponse({ description: 'PDF binary' })
  @ApiProduces('application/pdf')
  async pdfBinary(@Param('id') id: string, @Res() res: Response) {
    const buf = await this.pdf.generateInvoicePdfById(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="invoice-${id}.pdf"`,
    );
    res.send(buf);
  }
}
