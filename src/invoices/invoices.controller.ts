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

// Safely convert a Mongoose document (or plain object) to a serializable plain object
function isRecord(u: unknown): u is Record<string, unknown> {
  return !!u && typeof u === 'object';
}

function toPlain(obj: unknown): Record<string, unknown> {
  if (isRecord(obj)) return obj;
  return {};
}

function hasToObject(obj: unknown): obj is { toObject: () => unknown } {
  return (
    !!obj && typeof (obj as { toObject?: unknown }).toObject === 'function'
  );
}

function safeToObject(doc: unknown): Record<string, unknown> {
  if (hasToObject(doc)) {
    return toPlain((doc as { toObject: () => unknown }).toObject());
  }
  return toPlain(doc);
}

// Deep-serialize Mongo Decimal128 and other BSON-like values to JSON-friendly primitives
function normalizeDecimalLike(v: unknown): unknown {
  if (!v) return v;
  // Dates -> ISO strings
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    const anyV = v as Record<string, unknown> & {
      _bsontype?: unknown;
      toString?: () => string;
      toHexString?: () => string;
    };
    // MongoDB Decimal128 serialized shape
    if (typeof anyV.$numberDecimal === 'string') return anyV.$numberDecimal;
    // Direct BSON Decimal128 instance
    if (
      anyV._bsontype === 'Decimal128' &&
      typeof anyV.toString === 'function'
    ) {
      return anyV.toString();
    }
    // MongoDB ObjectId instance (robust detection)
    if (typeof anyV.toHexString === 'function') return anyV.toHexString();
    if (
      anyV._bsontype === 'ObjectID' ||
      anyV._bsontype === 'ObjectId' ||
      (anyV.constructor &&
        (anyV.constructor as { name?: string }).name === 'ObjectId')
    ) {
      if (typeof anyV.toString === 'function') return anyV.toString();
    }
  }
  return v;
}

function deepSerialize(value: unknown): unknown {
  const n = normalizeDecimalLike(value);
  if (n !== value) return n;
  if (Array.isArray(value)) return value.map((it) => deepSerialize(it));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deepSerialize(v);
    }
    return out;
  }
  return value;
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
  async draft(@Body() dto: CreateInvoiceDto): Promise<Record<string, unknown>> {
    const doc = await this.service.createDraft(dto);
    const obj = safeToObject(doc);
    return deepSerialize(obj) as Record<string, unknown>;
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Confirm draft invoice with DGI checks' })
  @ApiHeader({ name: 'X-Idempotency-Key', required: false })
  @ApiOkResponse({ description: 'Invoice confirmed (idempotent)' })
  async confirm(
    @Param('id') id: string,
    @Body() dto: ConfirmInvoiceDto,
    @Headers('x-idempotency-key') idemKey?: string,
    @Res({ passthrough: true }) res?: Response,
  ): Promise<Record<string, unknown>> {
    if (idemKey) {
      const tenantId = getTenantId();
      const ttlHours = (await this.settings.get(tenantId!)).invoice
        ?.idempotencyTTLHours;
      const expiresAt = Date.now() + (ttlHours ?? 24) * 3600 * 1000;
      const key = cacheKey(tenantId!, id, idemKey);
      const cached = idemCache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        // Idempotency cache hit: return 200 OK with the cached body
        if (res) res.status(200);
        return toPlain(cached.value);
      }
      const doc = await this.service.confirm(id, {
        equivalentCurrencyCode: dto?.equivalentCurrency?.code,
      });
      const obj = safeToObject(doc);
      const out = deepSerialize(obj);
      idemCache.set(key, { value: out, expiresAt });
      return out as Record<string, unknown>;
    }

    const doc = await this.service.confirm(id, {
      equivalentCurrencyCode: dto?.equivalentCurrency?.code,
    });
    return deepSerialize(safeToObject(doc)) as Record<string, unknown>;
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Get invoice by id' })
  async get(@Param('id') id: string): Promise<Record<string, unknown>> {
    const doc = await this.service.get(id);
    return deepSerialize(safeToObject(doc)) as Record<string, unknown>;
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
    const obj = safeToObject(inv) as {
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
    const normalized = deepSerialize({
      id: String(obj._id),
      number: obj.number,
      status: obj.status,
      type: obj.type,
      modePrix: obj.modePrix,
      client: obj.client,
      totals: obj.totals,
      equivalentCurrency: obj.equivalentCurrency,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    }) as Record<string, unknown>;
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
