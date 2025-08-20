import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { Invoice, InvoiceDocument } from '../invoices/invoice.schema';
import { getTenantId } from '../common/logger/request-context';

export type JournalState = 'pending' | 'ack' | 'rejected';

type JournalItemLean = {
  _id: Types.ObjectId;
  number?: string;
  status: 'DRAFT' | 'CONFIRMED';
  type: string;
  createdAt?: Date;
  updatedAt?: Date;
  security?: { source?: string };
  dispatch?: { state?: JournalState; attempts?: number; lastError?: string };
};

type Decimalish = Types.Decimal128 | number | string | null | undefined;

type SummaryAgg = { _id: string | null; totalTTC?: Decimalish; count?: number };
type TotalsAgg = { _id: null; totalTTC?: Decimalish; count?: number };
type TopItemAgg = {
  _id: { id?: Types.ObjectId | null; label?: string | null } | null;
  totalTTC?: Decimalish;
};
type TopClientAgg = {
  _id: { name?: string | null; nif?: string | null } | null;
  totalTTC?: Decimalish;
};

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Invoice.name)
    private readonly invoiceModel: Model<InvoiceDocument>,
  ) {}

  async mcfJournal(params: {
    state?: JournalState;
    page?: number;
    limit?: number;
  }) {
    const tenant = getTenantId();
    if (!tenant) throw new Error('Missing tenant in context');
    const tenantId = new Types.ObjectId(tenant);
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 50;
    const skip = (page - 1) * limit;

    const match: Record<string, unknown> = { tenantId };
    if (params.state) match['dispatch.state'] = params.state;

    const items: JournalItemLean[] = (await this.invoiceModel
      .find(match, {
        number: 1,
        status: 1,
        type: 1,
        createdAt: 1,
        updatedAt: 1,
        'security.source': 1,
        'dispatch.state': 1,
        'dispatch.attempts': 1,
        'dispatch.lastError': 1,
      })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean<JournalItemLean>({ virtuals: false })
      .exec()) as unknown as JournalItemLean[];

    const total = await this.invoiceModel.countDocuments(match);

    return {
      page,
      limit,
      total,
      items: items.map((it: JournalItemLean) => ({
        id: String(it._id),
        number: it.number,
        status: it.status,
        type: it.type,
        securitySource: it.security?.source ?? undefined,
        state: it.dispatch?.state ?? 'pending',
        attempts: it.dispatch?.attempts ?? 0,
        lastError: it.dispatch?.lastError ?? undefined,
        createdAt: it.createdAt,
        updatedAt: it.updatedAt,
      })),
    };
  }

  async salesSummary(params: {
    from?: string;
    to?: string;
    groupBy?: 'day' | 'month' | 'type' | 'group';
  }) {
    const tenant = getTenantId();
    if (!tenant) throw new Error('Missing tenant in context');
    const tenantId = new Types.ObjectId(tenant);
    const fromDate = params.from ? new Date(params.from) : undefined;
    const toDate = params.to ? new Date(params.to) : undefined;
    const match: Record<string, unknown> = {
      tenantId,
      status: 'CONFIRMED',
    };
    if (fromDate || toDate) {
      const createdAt: { $gte?: Date; $lte?: Date } = {};
      if (fromDate) createdAt.$gte = fromDate;
      if (toDate) createdAt.$lte = toDate;
      match['createdAt'] = createdAt;
    }

    const groupBy = params.groupBy ?? 'day';

    const summaryPipeline: PipelineStage[] = [{ $match: match }];

    if (groupBy === 'group') {
      summaryPipeline.push(
        { $unwind: '$lines' },
        {
          $group: {
            _id: '$lines.group',
            totalTTC: { $sum: '$lines.totalTTC' },
            count: { $sum: 1 },
          },
        },
        { $sort: { totalTTC: -1 } },
      );
    } else if (groupBy === 'type') {
      summaryPipeline.push(
        {
          $group: {
            _id: '$type',
            totalTTC: { $sum: '$totals.ttc' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      );
    } else if (groupBy === 'month') {
      summaryPipeline.push(
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m', date: '$createdAt' },
            },
            totalTTC: { $sum: '$totals.ttc' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      );
    } else {
      // day
      summaryPipeline.push(
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            totalTTC: { $sum: '$totals.ttc' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      );
    }

    const totalsPipeline: PipelineStage[] = [
      { $match: match },
      {
        $group: {
          _id: null,
          totalTTC: { $sum: '$totals.ttc' },
          count: { $sum: 1 },
        },
      },
    ];

    const topItemsPipeline: PipelineStage[] = [
      { $match: match },
      { $unwind: '$lines' },
      {
        $group: {
          _id: { id: '$lines.itemId', label: '$lines.label' },
          totalTTC: { $sum: '$lines.totalTTC' },
        },
      },
      { $sort: { totalTTC: -1 } },
      { $limit: 5 },
    ];

    const topClientsPipeline: PipelineStage[] = [
      { $match: match },
      {
        $group: {
          _id: {
            name: {
              $ifNull: ['$client.denomination', '$client.name'],
            },
            nif: '$client.nif',
          },
          totalTTC: { $sum: '$totals.ttc' },
        },
      },
      { $sort: { totalTTC: -1 } },
      { $limit: 5 },
    ];

    const [summaryRaw, totalsRaw, topItemsRaw, topClientsRaw] =
      await Promise.all([
        this.invoiceModel.aggregate<SummaryAgg>(summaryPipeline),
        this.invoiceModel.aggregate<TotalsAgg>(totalsPipeline),
        this.invoiceModel.aggregate<TopItemAgg>(topItemsPipeline),
        this.invoiceModel.aggregate<TopClientAgg>(topClientsPipeline),
      ]);

    const summary = summaryRaw.map((r) => ({
      key: r._id ?? 'Unknown',
      totalTTC: this.toStr(r.totalTTC),
      count: r.count ?? 0,
    }));

    const totals = totalsRaw.length
      ? {
          totalTTC: this.toStr(totalsRaw[0].totalTTC) ?? '0',
          count: totalsRaw[0].count ?? 0,
        }
      : { totalTTC: '0', count: 0 };

    const topItems = topItemsRaw.map((r) => ({
      label: r._id?.label ?? 'Unknown',
      totalTTC: this.toStr(r.totalTTC),
    }));

    const topClients = topClientsRaw.map((r) => ({
      name: r._id?.name ?? 'Unknown',
      nif: r._id?.nif ?? undefined,
      totalTTC: this.toStr(r.totalTTC),
    }));

    return { summary, totals, topItems, topClients };
  }

  private toStr(x: unknown): string | undefined {
    if (x == null) return undefined;
    if (typeof x === 'string') return x;
    if (typeof x === 'number') return String(x);
    if (x instanceof Date) return x.toISOString();
    if (x instanceof Types.Decimal128) return x.toString();
    if (typeof x === 'object') {
      const maybeObj = x as { toString?: () => string };
      if (
        typeof maybeObj.toString === 'function' &&
        maybeObj.toString !== Object.prototype.toString
      )
        return maybeObj.toString();
      try {
        return JSON.stringify(x);
      } catch {
        return '[Unserializable Object]';
      }
    }
    return String(x as string | number | boolean | bigint);
  }
}
