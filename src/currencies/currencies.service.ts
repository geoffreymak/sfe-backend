import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Currency, CurrencyDocument } from './currency.schema';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';

@Injectable()
export class CurrenciesService {
  constructor(
    @InjectModel(Currency.name)
    private readonly currencyModel: Model<CurrencyDocument>,
  ) {}

  async list(): Promise<CurrencyDocument[]> {
    return this.currencyModel.find().sort({ code: 1 }).exec();
  }

  async create(dto: CreateCurrencyDto): Promise<CurrencyDocument> {
    const code = dto.code.toUpperCase();

    const exists = await this.currencyModel.exists({ code }).exec();
    if (exists)
      throw new BadRequestException(`Currency ${code} already exists`);

    const doc = new this.currencyModel({
      code,
      name: dto.name,
      symbol: dto.symbol,
      enabled: dto.enabled ?? true,
      isBase: false,
      isDefaultAlt: false,
    });

    if (code === 'CDF') {
      doc.isBase = true;
      doc.enabled = true;
      doc.isDefaultAlt = false;
    }
    if (code === 'USD') {
      doc.isDefaultAlt = true;
      doc.enabled = true;
    }

    return doc.save();
  }

  async update(
    code: string,
    dto: UpdateCurrencyDto,
  ): Promise<CurrencyDocument> {
    code = code.toUpperCase();

    const cur = await this.currencyModel.findOne({ code }).exec();
    if (!cur) throw new NotFoundException('Currency not found');

    if (code === 'CDF' && dto.enabled === false) {
      throw new BadRequestException('CDF cannot be disabled');
    }
    if (code === 'USD' && dto.enabled === false) {
      throw new BadRequestException('USD cannot be disabled');
    }

    if (dto.name != null) cur.name = dto.name;
    if (dto.symbol != null) cur.symbol = dto.symbol;
    if (dto.enabled != null) cur.enabled = dto.enabled;

    // Enforce invariants
    if (code === 'CDF') {
      cur.isBase = true;
      cur.enabled = true;
      cur.isDefaultAlt = false;
    }
    if (code === 'USD') {
      cur.isDefaultAlt = true;
      cur.enabled = true;
    }

    await cur.save();
    return cur;
  }

  async delete(code: string): Promise<void> {
    code = code.toUpperCase();
    if (code === 'USD') throw new BadRequestException('USD cannot be deleted');
    if (code === 'CDF') throw new BadRequestException('CDF cannot be deleted');

    const res = await this.currencyModel.deleteOne({ code }).exec();
    if (res.deletedCount === 0)
      throw new NotFoundException('Currency not found');
  }
}
