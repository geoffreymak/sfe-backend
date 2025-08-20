import { Injectable } from '@nestjs/common';
import type { SettingsIntegrationEmcf } from '../../settings/settings.schema';
import type { InvoiceDocument } from '../../invoices/invoice.schema';

export type EmcfStatus =
  | { ok: true; note: string }
  | { ok: false; reason: string };

export type EmcfNormalizeResult = {
  source: 'emcf';
  normalized: boolean;
  uid?: string;
  totals?: { ht: string; vat: string; ttc: string };
  security?: {
    codeDefDgi: string;
    nimOrMid: string;
    counters?: string;
    certifiedAt: string; // ISO string
    qr: { payload: string };
  };
  note?: string;
};

@Injectable()
export class EmcfHttpGateway {
  // Minimal placeholder: avoid network dependency for now
  status(cfg?: SettingsIntegrationEmcf): EmcfStatus {
    if (!cfg?.baseUrlInfo) return { ok: false, reason: 'baseUrlInfo missing' };
    // Network ping intentionally skipped to keep build/runtime stable
    return { ok: true, note: 'configured (ping skipped)' };
  }

  // Offline-friendly normalization: derive uid and security without network
  normalizeInvoice(
    invoice: InvoiceDocument,
    cfg?: SettingsIntegrationEmcf,
  ): EmcfNormalizeResult {
    const uid = `EMCF-${String(invoice._id).slice(-8).toUpperCase()}`;
    const ht = invoice.totals.ht.toString();
    const vat = invoice.totals.vat.toString();
    const ttc = invoice.totals.ttc.toString();
    const nowIso = new Date().toISOString();
    const nim = cfg?.isf ? `NIM-${cfg.isf}` : 'NIM-UNKNOWN';
    const sig = 'SIGEMCF';
    const nif = cfg?.nif ?? 'NIF-UNKNOWN';
    const qrPayload = `RDCDEF01;${nim};${sig};${nif};${nowIso}`;
    return {
      source: 'emcf',
      normalized: true,
      uid,
      totals: { ht, vat, ttc },
      security: {
        codeDefDgi: sig,
        nimOrMid: nim,
        counters: '0001/0001',
        certifiedAt: nowIso,
        qr: { payload: qrPayload },
      },
      note: 'mocked normalize/confirm',
    };
  }
}
