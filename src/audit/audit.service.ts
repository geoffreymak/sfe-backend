import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash } from 'node:crypto';
import { AuditLog, AuditLogDocument } from './audit.schema';
import {
  getRequestId,
  getTenantId,
  getUserId,
} from '../common/logger/request-context';

function stableStringify(value: unknown): string {
  // simple stable stringify: sort object keys recursively
  const seen = new WeakSet<object>();
  const sorter = (v: unknown): unknown => {
    if (v && typeof v === 'object') {
      if (Array.isArray(v)) return (v as unknown[]).map(sorter);
      const obj = v as Record<string, unknown>;
      if (seen.has(obj)) return '[Circular]';
      seen.add(obj);
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(obj).sort()) {
        out[key] = sorter(obj[key]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(sorter(value));
}

function sha256(input: unknown): string | undefined {
  if (input === undefined) return undefined;
  const s = typeof input === 'string' ? input : stableStringify(input);
  return createHash('sha256').update(s).digest('hex');
}

export type AuditLogParams = {
  action: string;
  resource: string;
  resourceId?: string | Types.ObjectId;
  before?: unknown;
  after?: unknown;
};

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditModel: Model<AuditLogDocument>,
  ) {}

  async log(p: AuditLogParams) {
    const tenantId = getTenantId();
    if (!tenantId) throw new BadRequestException('Tenant context missing');
    const actorId = getUserId();
    const requestId = getRequestId();

    const resourceId = p.resourceId
      ? new Types.ObjectId(String(p.resourceId))
      : undefined;

    const doc = await this.auditModel.create({
      tenantId: new Types.ObjectId(tenantId),
      actorId: actorId ? new Types.ObjectId(actorId) : undefined,
      action: p.action,
      resource: p.resource,
      resourceId,
      beforeHash: sha256(p.before),
      afterHash: sha256(p.after),
      requestId,
      createdAt: new Date(),
    });
    return doc.toObject();
  }

  async query(params: {
    actorId?: string;
    action?: string;
    resource?: string;
    resourceId?: string;
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
  }) {
    const filter: Record<string, unknown> = {};
    if (params.actorId) filter.actorId = new Types.ObjectId(params.actorId);
    if (params.action) filter.action = params.action;
    if (params.resource) filter.resource = params.resource;
    if (params.resourceId)
      filter.resourceId = new Types.ObjectId(params.resourceId);
    if (params.from || params.to) {
      const createdAt: { $gte?: Date; $lte?: Date } = {};
      if (params.from) createdAt.$gte = params.from;
      if (params.to) createdAt.$lte = params.to;
      filter.createdAt = createdAt;
    }

    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.auditModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.auditModel.countDocuments(filter),
    ]);

    return { items, total, page, limit };
  }
}
