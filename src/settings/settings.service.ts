import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { UpdateQuery } from 'mongoose';
import {
  Settings,
  SettingsDocument,
  SettingsCurrency,
  SettingsInvoice,
  SettingsLoyalty,
  SettingsStock,
  SettingsIntegration,
  SettingsIntegrationEmcf,
} from './settings.schema';
import { UpdateSettingsDto } from './dto/update-settings.dto';

export type PublicSettings = {
  tenantId: Types.ObjectId;
  currency: SettingsCurrency;
  invoice: SettingsInvoice;
  loyalty: SettingsLoyalty;
  stock: SettingsStock;
  integration: Omit<SettingsIntegration, 'emcf'> & {
    emcf?: Omit<SettingsIntegrationEmcf, 'token'>;
  };
};

function defaultSettings(): Omit<Settings, 'tenantId'> {
  return {
    currency: {
      base: 'CDF',
      defaultAlt: 'USD',
      allowed: [],
      decimals: 2,
      rounding: 'HALF_UP',
    },
    invoice: {
      defaultModePrix: 'TTC',
      numbering: { prefix: 'FV', yearlyReset: true, width: 6 },
      idempotencyTTLHours: 24,
    },
    loyalty: {
      enabled: false,
      earn: {
        base: 'TTC',
        rate: 1,
        baseUnit: 1000,
        excludeTaxGroups: ['L', 'N'],
      },
      redeem: { pointValueCDF: 10 },
    },
    stock: {
      costingMethod: 'AVG',
      allowNegativeStock: false,
      reservationsEnabled: false,
    },
    integration: {
      mode: 'mock',
      emcf: {},
      mcf: {},
      safety: { subtotalCheck: true, confirmDeadlineSec: 120, pendingMax: 10 },
    },
  };
}

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Settings.name)
    private readonly settingsModel: Model<SettingsDocument>,
  ) {}

  async ensure(tenantId: string): Promise<SettingsDocument> {
    const tid = new Types.ObjectId(tenantId);
    // Atomic upsert to prevent duplicate key on concurrent calls
    const doc = await this.settingsModel
      .findOneAndUpdate(
        { tenantId: tid },
        { $setOnInsert: { tenantId: tid, ...defaultSettings() } },
        { new: true, upsert: true },
      )
      .exec();
    return doc as SettingsDocument;
  }

  async get(tenantId: string): Promise<SettingsDocument> {
    return this.ensure(tenantId);
  }

  async getPublic(tenantId: string): Promise<PublicSettings> {
    const s = await this.ensure(tenantId);
    const obj = s.toObject();
    const emcf = obj.integration?.emcf;
    return {
      tenantId: obj.tenantId,
      currency: obj.currency,
      invoice: obj.invoice,
      loyalty: obj.loyalty,
      stock: obj.stock,
      integration: {
        mode: obj.integration?.mode ?? 'mock',
        mcf: obj.integration?.mcf,
        safety: obj.integration?.safety ?? {
          subtotalCheck: true,
          confirmDeadlineSec: 120,
          pendingMax: 10,
        },
        emcf: emcf
          ? ({
              baseUrlInfo: emcf.baseUrlInfo,
              baseUrlInvoice: emcf.baseUrlInvoice,
              isf: emcf.isf,
              nif: emcf.nif,
            } as Omit<SettingsIntegrationEmcf, 'token'>)
          : undefined,
      },
    };
  }

  async update(
    tenantId: string,
    dto: UpdateSettingsDto,
  ): Promise<SettingsDocument> {
    // Enforce invariants only if currency is being updated (partial updates allowed)
    if (dto.currency) {
      if (dto.currency.base !== 'CDF') {
        throw new BadRequestException('currency.base is locked to CDF');
      }
      if (dto.currency.defaultAlt !== 'USD') {
        throw new BadRequestException('currency.defaultAlt is locked to USD');
      }
    }

    const tid = new Types.ObjectId(tenantId);
    // Ensure document exists and load current values for merges
    const currentDoc = await this.ensure(tenantId);
    const current = currentDoc.toObject();

    // Build $set with only provided sections
    const set: Partial<Settings> = {};
    if (dto.currency) set.currency = dto.currency as SettingsCurrency;
    if (dto.invoice) set.invoice = dto.invoice as SettingsInvoice;
    if (dto.loyalty) set.loyalty = dto.loyalty as SettingsLoyalty;
    if (dto.stock) set.stock = dto.stock as SettingsStock;
    if (dto.integration) {
      set.integration = {
        ...(current.integration ?? {}),
        ...dto.integration,
      } as SettingsIntegration;
    }

    if (Object.keys(set).length > 0) {
      // Ensure we pass a plain object to Mongoose (avoid class instances)
      const plainSet: Partial<Settings> = JSON.parse(
        JSON.stringify(set),
      ) as Partial<Settings>;
      const update: UpdateQuery<Settings> = { $set: plainSet };
      await this.settingsModel
        .updateOne({ tenantId: tid }, update, { upsert: true })
        .exec();
    }
    return this.ensure(tenantId);
  }
}
