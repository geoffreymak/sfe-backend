import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Stock, StockDocument } from './stock.schema';
import { StockBatch, StockBatchDocument } from './stock-batch.schema';
import { StockSerial, StockSerialDocument } from './stock-serial.schema';
import { StockMovement, StockMovementDocument } from './stock-movement.schema';
import { ReceiptDto } from './dto/receipt.dto';
import { TransferDto } from './dto/transfer.dto';
import { AdjustmentDto } from './dto/adjustment.dto';
import { Item, ItemDocument } from '../items/item.schema';
import { Warehouse, WarehouseDocument } from '../warehouses/warehouse.schema';
import { SettingsService } from '../settings/settings.service';
import { getTenantId } from '../common/logger/request-context';
import { AuditService } from '../audit/audit.service';

function d128From(
  v: string | number | Types.Decimal128 | undefined,
): Types.Decimal128 | undefined {
  if (v == null) return undefined;
  if (typeof v === 'number') return Types.Decimal128.fromString(String(v));
  if (typeof v === 'string') return Types.Decimal128.fromString(v);
  return v;
}

function toNum(v: Types.Decimal128 | string | number | undefined): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v);
  return parseFloat(v.toString());
}

@Injectable()
export class StockService {
  constructor(
    @InjectModel(Stock.name) private readonly stockModel: Model<StockDocument>,
    @InjectModel(StockBatch.name)
    private readonly batchModel: Model<StockBatchDocument>,
    @InjectModel(StockSerial.name)
    private readonly serialModel: Model<StockSerialDocument>,
    @InjectModel(StockMovement.name)
    private readonly movementModel: Model<StockMovementDocument>,
    @InjectModel(Item.name) private readonly itemModel: Model<ItemDocument>,
    @InjectModel(Warehouse.name)
    private readonly warehouseModel: Model<WarehouseDocument>,
    private readonly settingsService: SettingsService,
    private readonly audit: AuditService,
  ) {}

  private async ensureWarehouse(id: string) {
    const _id = new Types.ObjectId(id);
    const w = await this.warehouseModel.findById(_id).lean();
    if (!w) throw new BadRequestException('Warehouse not found');
    return w;
  }

  private async ensureItemBIE(id: string) {
    const _id = new Types.ObjectId(id);
    const it = await this.itemModel.findById(_id).lean<Item>();
    if (!it) throw new BadRequestException('Item not found');
    if (it.type !== 'BIE')
      throw new BadRequestException('Only BIE items are stock-managed');
    return it;
  }

  private async getSettings() {
    const tenantId = getTenantId();
    if (!tenantId) throw new BadRequestException('Tenant context missing');
    const s = await this.settingsService.get(tenantId);
    return s.stock;
  }

  private async getOrCreateStock(
    warehouseId: Types.ObjectId,
    itemId: Types.ObjectId,
  ) {
    let doc = await this.stockModel.findOne({ warehouseId, itemId }).exec();
    if (!doc) {
      doc = await this.stockModel.create({
        warehouseId,
        itemId,
        qty: Types.Decimal128.fromString('0'),
        avgUnitCost: Types.Decimal128.fromString('0'),
      });
    }
    return doc;
  }

  private updateAvg(
    stock: StockDocument,
    incomingQtyNum: number,
    incomingUnitCostNum?: number,
  ) {
    if (incomingQtyNum <= 0) return; // avg only affected by positive receipts
    const oldQty = toNum(stock.qty);
    const oldAvg = toNum(stock.avgUnitCost);
    const unit = incomingUnitCostNum ?? oldAvg;
    const newQty = oldQty + incomingQtyNum;
    const newAvg =
      newQty > 0 ? (oldQty * oldAvg + incomingQtyNum * unit) / newQty : 0;
    stock.avgUnitCost = Types.Decimal128.fromString(newAvg.toFixed(6));
  }

  async receipts(dto: ReceiptDto) {
    await this.ensureWarehouse(dto.warehouseId);
    const stockSettings = await this.getSettings();

    const wid = new Types.ObjectId(dto.warehouseId);
    const tid = new Types.ObjectId(getTenantId()!);

    for (const line of dto.lines) {
      const item = await this.ensureItemBIE(line.itemId);
      const iid = new Types.ObjectId(line.itemId);
      const qtyNum = toNum(line.qty);
      if (qtyNum <= 0) throw new BadRequestException('qty must be > 0');

      // tracking rules
      if (item.stockTracking === 'lot' && !line.lot) {
        throw new BadRequestException('lot is required for lot-tracked items');
      }
      if (item.stockTracking === 'serial') {
        const count = line.serials?.length ?? 0;
        if (!count || count !== Math.trunc(qtyNum)) {
          throw new BadRequestException(
            'serials[] required for serial-tracked items and must match qty',
          );
        }
      }

      const stock = await this.getOrCreateStock(wid, iid);
      const beforeQty = toNum(stock.qty);

      // AVG/FIFO handling
      const unitCostNum =
        line.unitCost != null ? toNum(line.unitCost) : undefined;
      if (stockSettings.costingMethod === 'FIFO') {
        // Record a batch
        await this.batchModel.create({
          warehouseId: wid,
          itemId: iid,
          lot: line.lot,
          qty: d128From(line.qty)!,
          unitCost: d128From(
            line.unitCost ?? String(toNum(stock.avgUnitCost)),
          )!,
          receivedAt: new Date(),
        });
      }

      // Update avg first based on previous quantity, then qty to avoid double-counting
      this.updateAvg(stock, qtyNum, unitCostNum);
      stock.qty = Types.Decimal128.fromString((beforeQty + qtyNum).toString());
      await stock.save();

      // Serial handling
      if (
        item.stockTracking === 'serial' &&
        line.serials &&
        line.serials.length
      ) {
        // Ensure serials not already 'in'
        const existing = await this.serialModel
          .find({ itemId: iid, serial: { $in: line.serials }, status: 'in' })
          .lean();
        if (existing.length > 0) {
          throw new BadRequestException('Some serials are already in stock');
        }
        const docs = line.serials.map((s) => ({
          tenantId: tid,
          warehouseId: wid,
          itemId: iid,
          serial: s,
          status: 'in',
          movedAt: new Date(),
        }));
        await this.serialModel.insertMany(docs);
      }

      // Movement
      const mv = await this.movementModel.create({
        type: 'receipt',
        warehouseId: wid,
        itemId: iid,
        qty: d128From(line.qty)!,
        unitCost: d128From(line.unitCost ?? toNum(stock.avgUnitCost))!,
        lot: line.lot,
        serials: line.serials ?? [],
        notes: undefined,
        createdAt: new Date(),
      });

      await this.audit.log({
        action: 'stock.receipt',
        resource: 'stock',
        resourceId: mv._id,
        after: {
          warehouseId: wid,
          itemId: iid,
          qty: line.qty,
          lot: line.lot,
          serials: line.serials ?? [],
        },
      });
    }

    return { ok: true };
  }

  private ensureSufficient(
    stock: StockDocument,
    qtyNum: number,
    allowNegative: boolean,
  ) {
    if (allowNegative) return;
    const available = toNum(stock.qty);
    if (available - qtyNum < 0)
      throw new BadRequestException('Insufficient stock');
  }

  async transfers(dto: TransferDto) {
    await this.ensureWarehouse(dto.fromWarehouseId);
    await this.ensureWarehouse(dto.toWarehouseId);

    const stockSettings = await this.getSettings();
    const widFrom = new Types.ObjectId(dto.fromWarehouseId);
    const widTo = new Types.ObjectId(dto.toWarehouseId);

    for (const line of dto.lines) {
      const item = await this.ensureItemBIE(line.itemId);
      const iid = new Types.ObjectId(line.itemId);
      const qtyNum = toNum(line.qty);
      if (qtyNum <= 0) throw new BadRequestException('qty must be > 0');

      if (item.stockTracking === 'lot' && !line.lot) {
        throw new BadRequestException('lot is required for lot-tracked items');
      }
      if (item.stockTracking === 'serial') {
        throw new BadRequestException(
          'serial-tracked transfers not supported yet',
        );
      }

      // Source stock
      const stockFrom = await this.getOrCreateStock(widFrom, iid);
      this.ensureSufficient(
        stockFrom,
        qtyNum,
        stockSettings.allowNegativeStock,
      );

      let costOutAvg = toNum(stockFrom.avgUnitCost);

      if (stockSettings.costingMethod === 'FIFO') {
        // consume from batches
        let remaining = qtyNum;
        const batchFilter: FilterQuery<StockBatch> = {
          warehouseId: widFrom,
          itemId: iid,
        } as FilterQuery<StockBatch>;
        if (line.lot) {
          Object.assign(batchFilter, { lot: line.lot });
        }
        const batches = await this.batchModel
          .find(batchFilter)
          .sort({ receivedAt: 1 })
          .exec();
        let consumedCost = 0;
        let consumedQty = 0;
        for (const b of batches) {
          if (remaining <= 0) break;
          const bQty = toNum(b.qty);
          const take = Math.min(remaining, bQty);
          remaining -= take;
          consumedQty += take;
          consumedCost += take * toNum(b.unitCost);
          const left = bQty - take;
          if (left <= 0) {
            await b.deleteOne();
          } else {
            b.qty = Types.Decimal128.fromString(left.toString());
            await b.save();
          }
        }
        if (remaining > 0) {
          this.ensureSufficient(
            stockFrom,
            qtyNum,
            stockSettings.allowNegativeStock,
          );
          // if still negative, raise
          throw new BadRequestException(
            'Insufficient stock in batches for FIFO',
          );
        }
        costOutAvg = consumedQty > 0 ? consumedCost / consumedQty : costOutAvg;
        // add batch at destination
        await this.batchModel.create({
          warehouseId: widTo,
          itemId: iid,
          lot: line.lot,
          qty: Types.Decimal128.fromString(qtyNum.toString()),
          unitCost: Types.Decimal128.fromString(costOutAvg.toString()),
          receivedAt: new Date(),
        });
      }

      // Update qty at both warehouses
      const fromQty = toNum(stockFrom.qty);
      stockFrom.qty = Types.Decimal128.fromString(
        (fromQty - qtyNum).toString(),
      );
      await stockFrom.save();

      const stockTo = await this.getOrCreateStock(widTo, iid);
      const toQty = toNum(stockTo.qty);
      stockTo.qty = Types.Decimal128.fromString((toQty + qtyNum).toString());
      // avg cost of destination unaffected except by receipts; update as weighted with costOutAvg
      this.updateAvg(stockTo, qtyNum, costOutAvg);
      await stockTo.save();

      // Movements
      const mvOut = await this.movementModel.create({
        type: 'transfer_out',
        warehouseId: widFrom,
        warehouseToId: widTo,
        itemId: iid,
        qty: Types.Decimal128.fromString(qtyNum.toString()),
        unitCost: Types.Decimal128.fromString(costOutAvg.toString()),
        lot: line.lot,
        serials: [],
        createdAt: new Date(),
      });
      await this.movementModel.create({
        type: 'transfer_in',
        warehouseId: widTo,
        warehouseToId: undefined,
        itemId: iid,
        qty: Types.Decimal128.fromString(qtyNum.toString()),
        unitCost: Types.Decimal128.fromString(costOutAvg.toString()),
        lot: line.lot,
        serials: [],
        createdAt: new Date(),
      });

      await this.audit.log({
        action: 'stock.transfer',
        resource: 'stock',
        resourceId: mvOut._id,
        after: {
          fromWarehouseId: widFrom,
          toWarehouseId: widTo,
          itemId: iid,
          qty: qtyNum,
          lot: line.lot,
        },
      });
    }

    return { ok: true };
  }

  async adjustments(dto: AdjustmentDto) {
    await this.ensureWarehouse(dto.warehouseId);
    const stockSettings = await this.getSettings();
    const wid = new Types.ObjectId(dto.warehouseId);

    for (const line of dto.lines) {
      const item = await this.ensureItemBIE(line.itemId);
      const iid = new Types.ObjectId(line.itemId);
      const delta = toNum(line.qtyDelta);
      if (delta === 0) continue;

      if (item.stockTracking === 'lot' && !line.lot) {
        throw new BadRequestException('lot is required for lot-tracked items');
      }
      if (item.stockTracking === 'serial') {
        throw new BadRequestException(
          'serial-tracked adjustments not supported yet',
        );
      }

      const stock = await this.getOrCreateStock(wid, iid);
      if (delta < 0) {
        this.ensureSufficient(
          stock,
          Math.abs(delta),
          stockSettings.allowNegativeStock,
        );
      }

      // FIFO negative: consume from batches
      if (stockSettings.costingMethod === 'FIFO' && delta < 0) {
        let remaining = Math.abs(delta);
        const batchFilter: FilterQuery<StockBatch> = {
          warehouseId: wid,
          itemId: iid,
        } as FilterQuery<StockBatch>;
        if (line.lot) {
          Object.assign(batchFilter, { lot: line.lot });
        }
        const batches = await this.batchModel
          .find(batchFilter)
          .sort({ receivedAt: 1 })
          .exec();
        for (const b of batches) {
          if (remaining <= 0) break;
          const bQty = toNum(b.qty);
          const take = Math.min(remaining, bQty);
          remaining -= take;
          const left = bQty - take;
          if (left <= 0) {
            await b.deleteOne();
          } else {
            b.qty = Types.Decimal128.fromString(left.toString());
            await b.save();
          }
        }
        if (remaining > 0)
          throw new BadRequestException(
            'Insufficient batch stock for adjustment',
          );
      }

      if (stockSettings.costingMethod === 'FIFO' && delta > 0) {
        // add a neutral-cost batch using current avg
        await this.batchModel.create({
          warehouseId: wid,
          itemId: iid,
          lot: line.lot,
          qty: Types.Decimal128.fromString(delta.toString()),
          unitCost: stock.avgUnitCost,
          receivedAt: new Date(),
        });
      }

      const cur = toNum(stock.qty);
      stock.qty = Types.Decimal128.fromString((cur + delta).toString());
      await stock.save();

      const mv = await this.movementModel.create({
        type: 'adjustment',
        warehouseId: wid,
        itemId: iid,
        qty: Types.Decimal128.fromString(delta.toString()),
        unitCost: stock.avgUnitCost,
        lot: line.lot,
        serials: [],
        notes: line.reason,
        createdAt: new Date(),
      });

      await this.audit.log({
        action: 'stock.adjustment',
        resource: 'stock',
        resourceId: mv._id,
        after: {
          warehouseId: wid,
          itemId: iid,
          delta,
          reason: line.reason,
          lot: line.lot,
        },
      });
    }

    return { ok: true };
  }

  async alerts() {
    // Aggregate items where total qty < reorderPoint
    const itemColl = this.itemModel.collection.name;
    type AlertAggRow = {
      itemId: Types.ObjectId;
      code: string;
      name: string;
      totalQty: Types.Decimal128 | string | number;
      reorderPoint: Types.Decimal128 | string | number;
    };

    const res = (await this.stockModel
      .aggregate([
        { $group: { _id: '$itemId', totalQty: { $sum: '$qty' } } },
        {
          $lookup: {
            from: itemColl,
            localField: '_id',
            foreignField: '_id',
            as: 'item',
          },
        },
        { $unwind: '$item' },
        {
          $addFields: {
            reorderPoint: '$item.reorderPoint',
          },
        },
        {
          $match: {
            reorderPoint: { $ne: null },
          },
        },
        {
          $project: {
            _id: 0,
            itemId: '$_id',
            code: '$item.code',
            name: '$item.name',
            totalQty: 1,
            reorderPoint: 1,
          },
        },
      ])
      .exec()) as AlertAggRow[];

    // Filter where totalQty < reorderPoint
    const alerts = res.filter(
      (row) => toNum(row.totalQty) < toNum(row.reorderPoint),
    );
    return { count: alerts.length, items: alerts };
  }
}
