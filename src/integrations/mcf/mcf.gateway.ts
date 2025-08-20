import { Injectable } from '@nestjs/common';
import type { SettingsIntegrationMcf } from '../../settings/settings.schema';
import type { InvoiceDocument } from '../../invoices/invoice.schema';

export type McfStatus =
  | { ok: true; note: string }
  | { ok: false; reason: string };

export type McfNormalizeResult = {
  source: 'mcf';
  normalized: boolean;
  totals?: { ht: string; vat: string; ttc: string };
  security?: {
    codeDefDgi: string; // SIG
    nimOrMid: string; // MID
    counters?: string; // FC/TC
    certifiedAt: string; // ISO
    qr: { payload: string };
  };
  note?: string;
};

@Injectable()
export class McfSerialGateway {
  // Minimal status that would ping device (C1h/C2h) when implemented
  statusMinimal(cfg?: SettingsIntegrationMcf): McfStatus {
    if (!cfg?.port) return { ok: false, reason: 'serial port not configured' };
    // TODO: open serial and send C1h/C2h commands
    return { ok: false, reason: 'driver not implemented yet' };
  }

  // Offline-friendly normalize: derive security fields without serial
  normalizeInvoice(
    invoice: InvoiceDocument,
    cfg?: SettingsIntegrationMcf,
  ): McfNormalizeResult {
    const ht = invoice.totals.ht.toString();
    const vat = invoice.totals.vat.toString();
    const ttc = invoice.totals.ttc.toString();
    const mid = cfg?.isf ? `MID-${cfg.isf}` : 'MID-UNKNOWN';
    const sig = 'SIGMCF';
    const nif = cfg?.nif ?? 'NIF-UNKNOWN';
    const nowIso = new Date().toISOString();
    const qrPayload = `RDCDEF01;${mid};${sig};${nif};${nowIso}`;
    return {
      source: 'mcf',
      normalized: true,
      totals: { ht, vat, ttc },
      security: {
        codeDefDgi: sig,
        nimOrMid: mid,
        counters: '0001/0002',
        certifiedAt: nowIso,
        qr: { payload: qrPayload },
      },
      note: 'mocked serial flow',
    };
  }
}
