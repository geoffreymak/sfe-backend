import {
  BadRequestException,
  Controller,
  Headers,
  Param,
  Post,
  Logger,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SettingsService } from '../../settings/settings.service';
import { getTenantId } from '../../common/logger/request-context';
import { EmcfHttpGateway, EmcfNormalizeResult } from '../emcf/emcf.gateway';
import { McfSerialGateway, McfNormalizeResult } from '../mcf/mcf.gateway';
import { InvoicesService } from '../../invoices/invoices.service';
import { AuditService } from '../../audit/audit.service';

type NormalizeResult =
  | ({ mode: 'emcf'; invoiceId: string } & Record<string, unknown>)
  | ({ mode: 'mcf'; invoiceId: string } & Record<string, unknown>)
  | ({ mode: 'mock'; invoiceId: string } & Record<string, unknown>);

// In-memory idempotency cache: key = tenantId:invoiceId:idemKey
const idempotencyCache = new Map<string, NormalizeResult>();

@ApiTags('Invoices')
@ApiBearerAuth('bearer')
@Controller('invoices')
export class OrchestratorController {
  private readonly logger = new Logger(OrchestratorController.name);
  constructor(
    private readonly settingsService: SettingsService,
    private readonly emcf: EmcfHttpGateway,
    private readonly mcf: McfSerialGateway,
    private readonly invoices: InvoicesService,
    private readonly audit: AuditService,
  ) {}

  @Post(':id/normalize')
  @ApiOkResponse({
    description: 'Normalize invoice by integration mode and return result',
  })
  @ApiHeader({ name: 'X-Idempotency-Key', required: false })
  async normalize(
    @Param('id') id: string,
    @Headers('x-idempotency-key') idemKey?: string,
  ): Promise<unknown> {
    const tenantId = getTenantId();
    if (!tenantId) throw new BadRequestException('Missing tenant context');

    if (idemKey && idemKey.length > 0) {
      const key = `${tenantId}:${id}:${idemKey}`;
      if (idempotencyCache.has(key)) {
        const cached = idempotencyCache.get(key)!;
        try {
          await this.audit.log({
            action: 'integrations.normalize.idempotent',
            resource: 'invoice',
            resourceId: id,
            after: { idemKey, cached: true },
          });
        } catch (err) {
          this.logger.warn(
            'Audit log failed (integrations.normalize.idempotent)',
            err as Error,
          );
        }
        return cached;
      }
      const result = await this.handleNormalize(id);
      idempotencyCache.set(key, result);
      try {
        await this.audit.log({
          action: 'integrations.normalize',
          resource: 'invoice',
          resourceId: id,
          after: { mode: result.mode },
        });
      } catch (err) {
        this.logger.warn(
          'Audit log failed (integrations.normalize)',
          err as Error,
        );
      }
      return result;
    }
    const result = await this.handleNormalize(id);
    try {
      await this.audit.log({
        action: 'integrations.normalize',
        resource: 'invoice',
        resourceId: id,
        after: { mode: result.mode },
      });
    } catch (err) {
      this.logger.warn(
        'Audit log failed (integrations.normalize)',
        err as Error,
      );
    }
    return result;
  }

  private async handleNormalize(id: string): Promise<NormalizeResult> {
    const tenantId = getTenantId();
    const settings = await this.settingsService.get(tenantId!);
    const mode = settings.integration?.mode ?? 'mock';

    // Fetch real invoice document
    const inv = await this.invoices.get(id);

    if (mode === 'emcf') {
      const result: EmcfNormalizeResult = this.emcf.normalizeInvoice(
        inv,
        settings.integration?.emcf,
      );
      const safety = settings.integration?.safety;
      if (safety?.subtotalCheck && result.totals) {
        const ht = inv.totals.ht.toString();
        const vat = inv.totals.vat.toString();
        const ttc = inv.totals.ttc.toString();
        if (
          result.totals.ht !== ht ||
          result.totals.vat !== vat ||
          result.totals.ttc !== ttc
        ) {
          throw new BadRequestException('Subtotal mismatch with e-MCF totals');
        }
      }
      if (result.security) {
        const before = { security: inv.security };
        inv.security = {
          source: 'emcf',
          codeDefDgi: result.security.codeDefDgi,
          nimOrMid: result.security.nimOrMid,
          counters: result.security.counters,
          certifiedAt: new Date(result.security.certifiedAt),
          qr: { payload: result.security.qr.payload },
        };
        await inv.save();
        try {
          await this.audit.log({
            action: 'invoice.security.update',
            resource: 'invoice',
            resourceId: inv._id,
            before,
            after: { security: inv.security },
          });
        } catch (err) {
          this.logger.warn(
            'Audit log failed (invoice.security.update emcf)',
            err as Error,
          );
        }
      }
      return { mode, invoiceId: id, ...result };
    }
    if (mode === 'mcf') {
      const result: McfNormalizeResult = this.mcf.normalizeInvoice(
        inv,
        settings.integration?.mcf,
      );
      const safety = settings.integration?.safety;
      if (safety?.subtotalCheck && result.totals) {
        const ht = inv.totals.ht.toString();
        const vat = inv.totals.vat.toString();
        const ttc = inv.totals.ttc.toString();
        if (
          result.totals.ht !== ht ||
          result.totals.vat !== vat ||
          result.totals.ttc !== ttc
        ) {
          throw new BadRequestException('Subtotal mismatch with MCF totals');
        }
      }
      if (result.security) {
        const before = { security: inv.security };
        inv.security = {
          source: 'mcf',
          codeDefDgi: result.security.codeDefDgi,
          nimOrMid: result.security.nimOrMid,
          counters: result.security.counters,
          certifiedAt: new Date(result.security.certifiedAt),
          qr: { payload: result.security.qr.payload },
        };
        await inv.save();
        try {
          await this.audit.log({
            action: 'invoice.security.update',
            resource: 'invoice',
            resourceId: inv._id,
            before,
            after: { security: inv.security },
          });
        } catch (err) {
          this.logger.warn(
            'Audit log failed (invoice.security.update mcf)',
            err as Error,
          );
        }
      }
      return { mode, invoiceId: id, ...result };
    }
    return { mode: 'mock', invoiceId: id, normalized: true };
  }
}
