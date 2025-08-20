import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Client, ClientDocument } from './client.schema';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { QueryClientsDto } from './dto/query-clients.dto';

@Injectable()
export class ClientsService {
  constructor(
    @InjectModel(Client.name)
    private readonly clientModel: Model<ClientDocument>,
  ) {}

  private enforceValidation(
    type: string,
    dto: Partial<CreateClientDto | UpdateClientDto>,
  ) {
    const t = (dto.type as string) || type;
    if (t === 'PM') {
      if (!dto.denomination || !dto.nif)
        throw new BadRequestException(
          'For PM, denomination and nif are required',
        );
    }
    if (t === 'PC' || t === 'PL') {
      if (!dto.name || !dto.nif)
        throw new BadRequestException('For PC/PL, name and nif are required');
    }
    if (t === 'AO') {
      if (!dto.name || !dto.refExo)
        throw new BadRequestException('For AO, name and refExo are required');
    }
  }

  private computeDisplayName(
    dto: Partial<CreateClientDto | UpdateClientDto>,
  ): string | undefined {
    if (dto.displayName && dto.displayName.trim().length > 0)
      return dto.displayName;
    if (dto.denomination) return dto.denomination;
    if (dto.name) return dto.name;
    return undefined;
  }

  async create(dto: CreateClientDto) {
    this.enforceValidation(dto.type, dto);
    const displayName = this.computeDisplayName(dto);
    const toCreate: Partial<Client> = {
      type: dto.type,
      displayName,
      denomination: dto.denomination,
      name: dto.name,
      nif: dto.nif,
      refExo: dto.refExo,
      email: dto.email,
      phone: dto.phone,
    };
    const doc = await this.clientModel.create(toCreate);
    return doc.toObject();
  }

  async get(id: string) {
    const _id = new Types.ObjectId(id);
    const doc = await this.clientModel.findById(_id).lean<Client>();
    if (!doc) throw new NotFoundException('Client not found');
    return doc;
  }

  async update(id: string, dto: UpdateClientDto) {
    const _id = new Types.ObjectId(id);
    const existing = await this.clientModel.findById(_id).lean<Client>();
    if (!existing) throw new NotFoundException('Client not found');
    this.enforceValidation(String(existing.type), dto);

    const displayName = this.computeDisplayName({ ...existing, ...dto });

    const update: Partial<Client> = {
      ...(dto.type ? { type: dto.type } : {}),
      ...(displayName ? { displayName } : {}),
      ...(dto.denomination !== undefined
        ? { denomination: dto.denomination }
        : {}),
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.nif !== undefined ? { nif: dto.nif } : {}),
      ...(dto.refExo !== undefined ? { refExo: dto.refExo } : {}),
      ...(dto.email !== undefined ? { email: dto.email } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
    };

    await this.clientModel.updateOne({ _id }, { $set: update }).exec();
    const res = await this.clientModel.findById(_id).lean<Client>();
    return res!;
  }

  async delete(id: string) {
    const _id = new Types.ObjectId(id);
    await this.clientModel.deleteOne({ _id }).exec();
    return { deleted: true };
  }

  async list(query: QueryClientsDto) {
    const filter: FilterQuery<Client> = {} as FilterQuery<Client>;
    if (query.type) {
      filter.type = query.type;
    }
    if (query.q) {
      const rx = new RegExp(query.q, 'i');
      filter.$or = [
        { displayName: rx },
        { denomination: rx },
        { name: rx },
        { email: rx },
        { phone: rx },
        { nif: rx },
        { refExo: rx },
      ];
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.clientModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.clientModel.countDocuments(filter),
    ]);

    return { items, total, page, limit };
  }
}
