import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FxRate, FxRateDocument } from './fx-rate.schema';
import { CreateFxRateDto } from './dto/create-fx-rate.dto';

@Injectable()
export class FxService {
  constructor(
    @InjectModel(FxRate.name)
    private readonly fxModel: Model<FxRateDocument>,
  ) {}

  async create(dto: CreateFxRateDto): Promise<FxRateDocument> {
    if (dto.base !== 'CDF') throw new BadRequestException('base must be CDF');
    const quote = dto.quote.toUpperCase();
    if (quote === 'CDF') throw new BadRequestException('quote cannot be CDF');

    const validFrom = new Date(dto.validFrom);
    if (isNaN(validFrom.getTime())) {
      throw new BadRequestException('validFrom must be a valid ISO date');
    }

    const rate = Types.Decimal128.fromString(dto.rate);

    const doc = new this.fxModel({
      base: 'CDF',
      quote,
      rate,
      provider: 'manual',
      validFrom,
    });
    return doc.save();
  }

  async list(quote?: string): Promise<FxRateDocument[]> {
    const filter: Partial<FxRate> = {};
    if (quote) filter.quote = quote.toUpperCase();
    return this.fxModel
      .find(filter)
      .sort({ validFrom: -1, createdAt: -1 })
      .exec();
  }

  async latest(quote: string): Promise<FxRateDocument> {
    const q = quote.toUpperCase();
    const doc = await this.fxModel
      .findOne({ quote: q })
      .sort({ validFrom: -1, createdAt: -1 })
      .exec();
    if (!doc) throw new NotFoundException('FX rate not found');
    return doc;
  }
}
