import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { MongoServerError } from 'mongodb';
import { Item, ItemDocument } from './item.schema';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { QueryItemsDto } from './dto/query-items.dto';
import { DGI_ITEM_GROUP_CONSTRAINTS } from '../common/dgi/dgi-constants';
import { AuditService } from '../audit/audit.service';

function toDecimalOrUndefined(v?: string) {
  return v != null ? Types.Decimal128.fromString(v) : undefined;
}

@Injectable()
export class ItemsService {
  constructor(
    @InjectModel(Item.name)
    private readonly itemModel: Model<ItemDocument>,
    private readonly audit: AuditService,
  ) {}

  private enforcePricesXor(
    dto: { priceHT?: string; priceTTC?: string },
    requireAtLeastOne: boolean,
  ) {
    const hasHT = dto.priceHT != null && dto.priceHT !== '';
    const hasTTC = dto.priceTTC != null && dto.priceTTC !== '';
    if (requireAtLeastOne && !hasHT && !hasTTC) {
      throw new BadRequestException(
        'Either priceHT or priceTTC must be provided',
      );
    }
    if (hasHT && hasTTC) {
      throw new BadRequestException(
        'priceHT and priceTTC are mutually exclusive',
      );
    }
  }

  private enforceTaxGroup(type: string | undefined, group: string | undefined) {
    if (type === 'TAX') {
      const allowed = DGI_ITEM_GROUP_CONSTRAINTS.TAX_ALLOWED_GROUPS;
      if (!group || !allowed.includes(group)) {
        throw new BadRequestException(
          "For TAX items, taxGroupDefault must be one of ['L','N']",
        );
      }
    }
  }

  async create(dto: CreateItemDto) {
    this.enforcePricesXor(dto, true);
    this.enforceTaxGroup(dto.type, dto.taxGroupDefault);

    const toCreate: Partial<Item> = {
      code: dto.code,
      name: dto.name,
      type: dto.type,
      unit: dto.unit,
      barcode: dto.barcode,
      taxGroupDefault: dto.taxGroupDefault,
      priceHT: toDecimalOrUndefined(dto.priceHT),
      priceTTC: toDecimalOrUndefined(dto.priceTTC),
      stockTracking: dto.stockTracking ?? 'none',
      reorderPoint: toDecimalOrUndefined(dto.reorderPoint),
      minStock: toDecimalOrUndefined(dto.minStock),
      maxStock: toDecimalOrUndefined(dto.maxStock),
    };

    try {
      const doc = await this.itemModel.create(toCreate);
      await this.audit.log({
        action: 'items.create',
        resource: 'items',
        resourceId: doc._id,
        after: doc.toObject(),
      });
      return doc.toObject();
    } catch (err: unknown) {
      if (err instanceof MongoServerError && err.code === 11000) {
        throw new BadRequestException('Code must be unique per tenant');
      }
      throw err;
    }
  }

  async get(id: string) {
    const _id = new Types.ObjectId(id);
    const doc = await this.itemModel.findById(_id).lean<Item>();
    if (!doc) throw new NotFoundException('Item not found');
    return doc;
  }

  async update(id: string, dto: UpdateItemDto) {
    // fetch existing
    const _id = new Types.ObjectId(id);
    const existing = await this.itemModel.findById(_id).lean<Item>();
    if (!existing) throw new NotFoundException('Item not found');

    // validations
    this.enforcePricesXor(dto, false);
    const effectiveType = dto.type ?? (existing.type as string);
    const effectiveGroup =
      dto.taxGroupDefault ?? (existing.taxGroupDefault as string);
    this.enforceTaxGroup(effectiveType, effectiveGroup);

    const update: Partial<Item> = {
      ...(dto.code !== undefined ? { code: dto.code } : {}),
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
      ...(dto.barcode !== undefined ? { barcode: dto.barcode } : {}),
      ...(dto.taxGroupDefault !== undefined
        ? { taxGroupDefault: dto.taxGroupDefault }
        : {}),
      ...(dto.priceHT !== undefined
        ? { priceHT: toDecimalOrUndefined(dto.priceHT) }
        : {}),
      ...(dto.priceTTC !== undefined
        ? { priceTTC: toDecimalOrUndefined(dto.priceTTC) }
        : {}),
      ...(dto.stockTracking !== undefined
        ? { stockTracking: dto.stockTracking }
        : {}),
      ...(dto.reorderPoint !== undefined
        ? { reorderPoint: toDecimalOrUndefined(dto.reorderPoint) }
        : {}),
      ...(dto.minStock !== undefined
        ? { minStock: toDecimalOrUndefined(dto.minStock) }
        : {}),
      ...(dto.maxStock !== undefined
        ? { maxStock: toDecimalOrUndefined(dto.maxStock) }
        : {}),
    };

    await this.itemModel.updateOne({ _id }, { $set: update }).exec();
    const res = await this.itemModel.findById(_id).lean<Item>();
    await this.audit.log({
      action: 'items.update',
      resource: 'items',
      resourceId: id,
      before: existing,
      after: res!,
    });
    return res!;
  }

  async delete(id: string) {
    const _id = new Types.ObjectId(id);
    const existing = await this.itemModel.findById(_id).lean<Item>();
    await this.itemModel.deleteOne({ _id }).exec();
    await this.audit.log({
      action: 'items.delete',
      resource: 'items',
      resourceId: id,
      before: existing ?? undefined,
    });
    return { deleted: true };
  }

  async list(query: QueryItemsDto) {
    const filter: FilterQuery<Item> = {} as FilterQuery<Item>;
    if (query.type) filter.type = query.type;
    if (query.taxGroup) filter.taxGroupDefault = query.taxGroup;

    if (query.q) {
      const rx = new RegExp(query.q, 'i');
      filter.$or = [{ code: rx }, { name: rx }, { barcode: rx }, { unit: rx }];
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.itemModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.itemModel.countDocuments(filter),
    ]);

    return { items, total, page, limit };
  }
}
