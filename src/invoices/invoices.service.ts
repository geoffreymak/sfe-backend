import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession } from 'mongoose';
import {
  Invoice,
  InvoiceCounter,
  InvoiceCounterDocument,
  InvoiceDocument,
} from './invoice.schema';
import { CreateInvoiceDto, InvoiceLineDto } from './dto/create-invoice.dto';
import {
  RULES,
  TaxGroupMeta,
  isItemType,
  isTaxGroup,
  ItemType,
  TaxGroup,
} from '../common/dgi/dgi-constants';
import {
  Cents,
  centsToString,
  mulQtyPriceToCents,
  parseMoneyToCents,
  parseQtyToThousandths,
  splitFromTtcCents,
  vatFromHtCents,
} from '../common/money/money.util';
import { SettingsService } from '../settings/settings.service';
import { getTenantId } from '../common/logger/request-context';
import { FxService } from '../fx/fx.service';
import { AuditService } from '../audit/audit.service';

export type ConfirmOptions = {
  equivalentCurrencyCode?: string;
};

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);
  constructor(
    @InjectModel(Invoice.name)
    private readonly invoiceModel: Model<InvoiceDocument>,
    @InjectModel(InvoiceCounter.name)
    private readonly counterModel: Model<InvoiceCounterDocument>,
    private readonly settings: SettingsService,
    private readonly fx: FxService,
    private readonly audit: AuditService,
  ) {}

  private computeLineTotals(
    modePrix: 'HT' | 'TTC',
    line: InvoiceLineDto,
  ): { totalHT: Cents; totalVAT: Cents; totalTTC: Cents } {
    // DGI: validate types and group allowed for item type
    if (!isItemType(line.kind)) {
      throw new BadRequestException('Invalid item kind');
    }
    if (!isTaxGroup(line.group)) {
      throw new BadRequestException('Invalid tax group');
    }
    const kind: ItemType = line.kind;
    const group: TaxGroup = line.group;
    if (!RULES.tax.itemGroupAllowed(kind, group)) {
      throw new BadRequestException(
        `Line group ${group} not allowed for kind ${kind}`,
      );
    }

    const vatRate = TaxGroupMeta[group]?.vatRate;
    const rate = typeof vatRate === 'number' ? vatRate : 0;

    let qTh: bigint;
    let unitCents: Cents;
    try {
      qTh = parseQtyToThousandths(line.qty);
    } catch {
      throw new BadRequestException('Invalid qty format');
    }
    try {
      unitCents = parseMoneyToCents(line.unitPrice);
    } catch {
      throw new BadRequestException('Invalid unitPrice format');
    }

    if (modePrix === 'HT') {
      const totalHT = mulQtyPriceToCents(qTh, unitCents);
      const totalVAT = vatFromHtCents(totalHT, rate);
      const totalTTC = totalHT + totalVAT;
      return { totalHT, totalVAT, totalTTC };
    } else {
      const totalTTC = mulQtyPriceToCents(qTh, unitCents);
      if (rate > 0) {
        const { ht, vat } = splitFromTtcCents(totalTTC, rate);
        return { totalHT: ht, totalVAT: vat, totalTTC };
      }
      return { totalHT: totalTTC, totalVAT: 0n, totalTTC };
    }
  }

  private toD128(c: Cents): Types.Decimal128 {
    return Types.Decimal128.fromString(centsToString(c));
  }

  // Narrow MongoDB duplicate key error code from unknown
  private getMongoErrorCode(err: unknown): number | undefined {
    if (
      err &&
      typeof err === 'object' &&
      'code' in (err as Record<string, unknown>)
    ) {
      const code = (err as { code?: unknown }).code;
      return typeof code === 'number' ? code : undefined;
    }
    return undefined;
  }

  async createDraft(dto: CreateInvoiceDto): Promise<InvoiceDocument> {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('Invoice requires at least one line');
    }

    // Ensure client snapshot is provided to avoid runtime errors further down
    if (!dto.client) {
      throw new BadRequestException('client is required');
    }

    let sumHT: Cents = 0n;
    let sumVAT: Cents = 0n;
    let sumTTC: Cents = 0n;

    const lines = dto.lines.map((l) => {
      const res = this.computeLineTotals(dto.modePrix, l);
      sumHT += res.totalHT;
      sumVAT += res.totalVAT;
      sumTTC += res.totalTTC;

      // Validate and convert itemId
      let itemId: Types.ObjectId | undefined;
      if (l.itemId) {
        if (!Types.ObjectId.isValid(l.itemId)) {
          throw new BadRequestException('Invalid itemId');
        }
        itemId = new Types.ObjectId(l.itemId);
      }

      // Validate and convert qty/unitPrice to Decimal128
      let qtyD128: Types.Decimal128;
      let unitPriceD128: Types.Decimal128;
      try {
        qtyD128 = Types.Decimal128.fromString(l.qty);
      } catch {
        throw new BadRequestException('Invalid qty format');
      }
      try {
        unitPriceD128 = Types.Decimal128.fromString(l.unitPrice);
      } catch {
        throw new BadRequestException('Invalid unitPrice format');
      }

      return {
        itemId,
        kind: l.kind,
        group: l.group,
        label: l.label,
        qty: qtyD128,
        unitPrice: unitPriceD128,
        totalHT: this.toD128(res.totalHT),
        totalVAT: this.toD128(res.totalVAT),
        totalTTC: this.toD128(res.totalTTC),
      };
    });

    // Ensure tenant context is present and explicitly set on the document
    const tenantId = getTenantId();
    if (!tenantId) throw new BadRequestException('Tenant context missing');

    const toCreate: Partial<Invoice> = {
      status: 'DRAFT',
      modePrix: dto.modePrix,
      type: dto.type,
      tenantId: new Types.ObjectId(tenantId),
      client: {
        type: dto.client.type,
        denomination: dto.client.denomination,
        name: dto.client.name,
        nif: dto.client.nif,
        refExo: dto.client.refExo,
      },
      lines,
      totals: {
        ht: this.toD128(sumHT),
        vat: this.toD128(sumVAT),
        ttc: this.toD128(sumTTC),
      },
      avoir: dto.avoir,
    } as Invoice;

    const doc = await this.invoiceModel.create(toCreate);
    try {
      await this.audit.log({
        action: 'invoice.createDraft',
        resource: 'invoice',
        resourceId: doc._id,
        after: doc.toObject(),
      });
    } catch (err) {
      this.logger.warn('Audit log failed (invoice.createDraft)', err as Error);
    }
    return doc;
  }

  private async nextNumberFor(
    invoice: InvoiceDocument,
    session?: ClientSession | null,
  ): Promise<string> {
    const tenantId = getTenantId();
    if (!tenantId) throw new BadRequestException('Tenant context missing');
    const settings = await this.settings.get(tenantId);
    const cfg = settings.invoice?.numbering ?? {
      prefix: invoice.type,
      yearlyReset: true,
      width: 6,
    };
    const now = new Date();
    const year = now.getFullYear();
    // Retry a few times to tolerate unique index races on first upsert
    const query = {
      tenantId: new Types.ObjectId(tenantId),
      type: invoice.type,
      year: cfg.yearlyReset ? year : 0,
    } as const;

    let countDoc: InvoiceCounterDocument | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        countDoc = await this.counterModel.findOneAndUpdate(
          query,
          { $inc: { seq: 1 } },
          {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
            // pass-through session if provided
            session: session ?? undefined,
          },
        );
        break;
      } catch (e: unknown) {
        const code = this.getMongoErrorCode(e);
        // Duplicate key on unique (tenantId,type,year) due to race
        if (code === 11000) {
          this.logger.warn(
            `InvoiceCounter upsert race detected for ${invoice.type}/${year}, retrying... (attempt ${
              attempt + 1
            }/5)`,
          );
          await new Promise((r) => setTimeout(r, 10));
          continue;
        }
        throw e;
      }
    }
    if (!countDoc) {
      // Last resort fetch without inc to diagnose
      countDoc = await this.counterModel
        .findOne(query)
        .session(session ?? null)
        .exec();
      if (!countDoc)
        throw new BadRequestException('Failed to allocate invoice number');
    }
    const seq = String(countDoc.seq).padStart(cfg.width ?? 6, '0');
    // Ensure numbering is unique across invoice types by using the type as prefix
    const prefix = invoice.type; // e.g., FV, FA, EA, etc.
    return cfg.yearlyReset ? `${prefix}${year}-${seq}` : `${prefix}${seq}`;
  }

  private enforceConfirmRules(inv: InvoiceDocument) {
    // AO client requires refExo
    if (inv.client.type === 'AO' && !inv.client.refExo) {
      throw new BadRequestException('AO client requires refExo');
    }
    // FA/EA require avoir metadata with origin except RRR
    if (inv.type === 'FA' || inv.type === 'EA') {
      if (!inv.avoir || !inv.avoir.nature) {
        throw new BadRequestException('FA/EA require avoir.nature');
      }
      const needOrigin = RULES.avoir.originRequired(inv.avoir.nature);
      if (needOrigin && !inv.avoir.originInvoiceRef) {
        throw new BadRequestException(
          'FA/EA require originInvoiceRef for this nature',
        );
      }
    }
  }

  async confirm(id: string, opts: ConfirmOptions): Promise<InvoiceDocument> {
    const _id = new Types.ObjectId(id);

    // Use a transaction to atomically allocate a number and confirm the invoice
    const session = await this.invoiceModel.db.startSession();
    try {
      let confirmed: InvoiceDocument | null = null;
      await session.withTransaction(async () => {
        const inv = await this.invoiceModel.findById(_id).session(session);
        if (!inv) throw new NotFoundException('Invoice not found');
        if (inv.status !== 'DRAFT') {
          confirmed = inv; // idempotent: already confirmed
          return;
        }

        // Validations
        this.enforceConfirmRules(inv);

        // Equivalent currency
        if (opts.equivalentCurrencyCode) {
          const fx = await this.fx.latest(opts.equivalentCurrencyCode);
          inv.equivalentCurrency = {
            code: fx.quote,
            rate: fx.rate,
            provider: fx.provider,
            at: fx.validFrom,
          };
        }

        const before = inv.toObject();
        inv.number = await this.nextNumberFor(inv, session);
        inv.status = 'CONFIRMED';
        await inv.save({ session });

        confirmed = inv;

        // We keep audit outside of the transaction to avoid aborting confirm on audit failure
        try {
          await this.audit.log({
            action: 'invoice.confirm',
            resource: 'invoice',
            resourceId: inv._id,
            before,
            after: inv.toObject(),
          });
        } catch (err) {
          this.logger.warn('Audit log failed (invoice.confirm)', err as Error);
        }
      });

      if (!confirmed) {
        // In case transaction early-returned due to idempotency, fetch latest state
        const inv = await this.invoiceModel.findById(_id).exec();
        if (!inv) throw new NotFoundException('Invoice not found');
        // Log idempotent confirm
        try {
          await this.audit.log({
            action: 'invoice.confirm.idempotent',
            resource: 'invoice',
            resourceId: inv._id,
            after: inv.toObject(),
          });
        } catch (err) {
          this.logger.warn(
            'Audit log failed (invoice.confirm.idempotent)',
            err as Error,
          );
        }
        return inv;
      }

      return confirmed;
    } finally {
      await session.endSession();
    }
  }

  async get(id: string): Promise<InvoiceDocument> {
    const _id = new Types.ObjectId(id);
    const doc = await this.invoiceModel.findById(_id).exec();
    if (!doc) throw new NotFoundException('Invoice not found');
    return doc;
  }

  async list(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.invoiceModel
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.invoiceModel.countDocuments(),
    ]);
    return { items, total, page, limit };
  }
}
