import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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
    let doc = await this.settingsModel.findOne({ tenantId: tid }).exec();
    if (!doc) {
      doc = await this.settingsModel.create({
        tenantId: tid,
        ...defaultSettings(),
      });
    }
    return doc;
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
    // Enforce invariants
    if (dto.currency.base !== 'CDF') {
      throw new BadRequestException('currency.base is locked to CDF');
    }
    if (dto.currency.defaultAlt !== 'USD') {
      throw new BadRequestException('currency.defaultAlt is locked to USD');
    }

    const tid = new Types.ObjectId(tenantId);
    await this.ensure(tenantId);

    await this.settingsModel
      .updateOne(
        { tenantId: tid },
        {
          $set: {
            currency: dto.currency,
            invoice: dto.invoice,
            loyalty: dto.loyalty,
            stock: dto.stock,
            integration: dto.integration,
          },
        },
        { upsert: true },
      )
      .exec();
    return this.ensure(tenantId);
  }
}
