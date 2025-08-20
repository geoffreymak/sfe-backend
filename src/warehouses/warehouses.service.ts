import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Warehouse, WarehouseDocument } from './warehouse.schema';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

@Injectable()
export class WarehousesService {
  constructor(
    @InjectModel(Warehouse.name)
    private readonly warehouseModel: Model<WarehouseDocument>,
  ) {}

  async list() {
    const data = await this.warehouseModel
      .find()
      .sort({ createdAt: -1 })
      .lean();
    return data;
  }

  async create(dto: CreateWarehouseDto) {
    try {
      const doc = await this.warehouseModel.create({
        code: dto.code,
        name: dto.name,
        address: dto.address,
      });
      return doc.toObject();
    } catch (err: unknown) {
      // Rely on Mongo duplicate key for unique per tenant
      const e = err as { code?: number };
      if (e?.code === 11000) {
        throw new BadRequestException(
          'Warehouse code must be unique per tenant',
        );
      }
      throw err;
    }
  }

  async get(id: string) {
    const _id = new Types.ObjectId(id);
    const doc = await this.warehouseModel.findById(_id).lean<Warehouse>();
    if (!doc) throw new NotFoundException('Warehouse not found');
    return doc;
  }

  async update(id: string, dto: UpdateWarehouseDto) {
    const _id = new Types.ObjectId(id);
    const existing = await this.warehouseModel.findById(_id).lean<Warehouse>();
    if (!existing) throw new NotFoundException('Warehouse not found');

    await this.warehouseModel
      .updateOne(
        { _id },
        {
          $set: {
            ...(dto.code !== undefined ? { code: dto.code } : {}),
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.address !== undefined ? { address: dto.address } : {}),
          },
        },
      )
      .exec();

    return this.get(id);
  }

  async delete(id: string) {
    const _id = new Types.ObjectId(id);
    await this.warehouseModel.deleteOne({ _id }).exec();
    return { deleted: true };
  }
}
