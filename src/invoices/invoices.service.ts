import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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

    const qTh = parseQtyToThousandths(line.qty);
    const unitCents = parseMoneyToCents(line.unitPrice);

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

  async createDraft(dto: CreateInvoiceDto): Promise<InvoiceDocument> {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('Invoice requires at least one line');
    }

    let sumHT: Cents = 0n;
    let sumVAT: Cents = 0n;
    let sumTTC: Cents = 0n;

    const lines = dto.lines.map((l) => {
      const res = this.computeLineTotals(dto.modePrix, l);
      sumHT += res.totalHT;
      sumVAT += res.totalVAT;
      sumTTC += res.totalTTC;
      return {
        itemId: l.itemId ? new Types.ObjectId(l.itemId) : undefined,
        kind: l.kind,
        group: l.group,
        label: l.label,
        qty: Types.Decimal128.fromString(l.qty),
        unitPrice: Types.Decimal128.fromString(l.unitPrice),
        totalHT: this.toD128(res.totalHT),
        totalVAT: this.toD128(res.totalVAT),
        totalTTC: this.toD128(res.totalTTC),
      };
    });

    const toCreate: Partial<Invoice> = {
      status: 'DRAFT',
      modePrix: dto.modePrix,
      type: dto.type,
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

  private async nextNumberFor(invoice: InvoiceDocument): Promise<string> {
    const tenantId = getTenantId();
    if (!tenantId) throw new Error('Missing tenantId in context');
    const settings = await this.settings.get(tenantId);
    const cfg = settings.invoice?.numbering ?? {
      prefix: invoice.type,
      yearlyReset: true,
      width: 6,
    };
    const now = new Date();
    const year = now.getFullYear();
    const countDoc = await this.counterModel.findOneAndUpdate(
      {
        tenantId: new Types.ObjectId(tenantId),
        type: invoice.type,
        year: cfg.yearlyReset ? year : 0,
      },
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    );
    const seq = String(countDoc.seq).padStart(cfg.width ?? 6, '0');
    return cfg.yearlyReset
      ? `${cfg.prefix}${year}-${seq}`
      : `${cfg.prefix}${seq}`;
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
    const inv = await this.invoiceModel.findById(_id);
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status !== 'DRAFT') {
      // idempotent confirm: log and return
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
      return inv; // idempotent behavior at model level
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
    inv.number = await this.nextNumberFor(inv);
    inv.status = 'CONFIRMED';
    await inv.save();
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
    return inv;
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
