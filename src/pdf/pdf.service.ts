import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Invoice, InvoiceDocument } from '../invoices/invoice.schema';
import { getTenantId } from '../common/logger/request-context';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

// Local helper types to avoid `any` usage and satisfy lint rules
type Decimalish = Types.Decimal128 | string | number | null | undefined;

interface InvoiceLean {
  number?: string;
  status: 'DRAFT' | 'CONFIRMED';
  type: string;
  createdAt?: Date | string;
  client?: {
    denomination?: string;
    name?: string;
    nif?: string;
    refExo?: string;
  };
  lines?: Array<{
    label?: string;
    kind?: string;
    qty?: Decimalish;
    unitPrice?: Decimalish;
    totalTTC?: Decimalish;
  }>;
  totals?: {
    ht?: Decimalish;
    vat?: Decimalish;
    ttc?: Decimalish;
  };
  equivalentCurrency?: {
    code: string;
    rate?: Decimalish;
  };
  security?: {
    codeDefDgi?: string;
    qr?: { payload?: string };
  };
}

// Minimal surface of the PDF document we exercise, to keep strong typing
type PdfDoc = {
  on(event: 'data', listener: (chunk: Buffer) => void): PdfDoc;
  on(event: 'error', listener: (err: Error) => void): PdfDoc;
  on(event: 'end', listener: () => void): PdfDoc;
  fontSize(size: number): PdfDoc;
  text(text: string, options?: { align?: 'left' | 'right' | 'center' }): PdfDoc;
  moveDown(lines?: number): PdfDoc;
  moveTo(x: number, y: number): PdfDoc;
  lineTo(x: number, y: number): PdfDoc;
  stroke(): PdfDoc;
  image(
    img: Buffer,
    options?: { width?: number; align?: 'left' | 'center' | 'right' },
  ): PdfDoc;
  end(): void;
  x: number;
  y: number;
};

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  constructor(
    @InjectModel(Invoice.name)
    private readonly invoiceModel: Model<InvoiceDocument>,
  ) {}

  async generateInvoicePdfById(id: string): Promise<Buffer> {
    const tenant = getTenantId();
    if (!tenant) throw new Error('Missing tenant in context');
    const tenantId = new Types.ObjectId(tenant);

    const inv = await this.invoiceModel
      .findOne({ _id: new Types.ObjectId(id), tenantId })
      .lean<InvoiceLean>()
      .exec();
    if (!inv) throw new Error('Invoice not found');

    return this.generateInvoicePdf(inv);
  }

  private toStr(x: unknown): string {
    if (x == null) return '';
    if (typeof x === 'string') return x;
    if (
      typeof x === 'number' ||
      typeof x === 'boolean' ||
      typeof x === 'bigint'
    )
      return String(x);
    if (x instanceof Date) return x.toISOString();
    if (x instanceof Types.Decimal128) return x.toString();
    if (typeof x === 'object') {
      const maybeObj = x as { toString?: () => string };
      if (
        typeof maybeObj.toString === 'function' &&
        maybeObj.toString !== Object.prototype.toString
      )
        return maybeObj.toString();
      try {
        return JSON.stringify(x);
      } catch {
        return '[Unserializable Object]';
      }
    }
    // symbol/function
    return String(x as string | number | boolean | bigint);
  }

  async generateInvoicePdf(inv: InvoiceLean): Promise<Buffer> {
    // Precompute QR buffer if available to avoid async work inside Promise executor
    let qrPng: Buffer | undefined;
    if (inv.security?.qr?.payload) {
      try {
        const qrcode = QRCode as unknown as {
          toBuffer: (
            text: string,
            opts?: { margin?: number; scale?: number },
          ) => Promise<Buffer>;
        };
        qrPng = await qrcode.toBuffer(inv.security.qr.payload, {
          margin: 1,
          scale: 4,
        });
      } catch (err) {
        this.logger.warn('QR code buffer generation failed', err as Error);
      }
    }

    const PdfCtor = PDFDocument as unknown as new (opts: {
      size: string;
      margin: number;
    }) => PdfDoc;
    const doc = new PdfCtor({
      size: 'A4',
      margin: 40,
    });
    const chunks: Buffer[] = [];
    return new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (c: Buffer) => {
        chunks.push(c);
      });
      doc.on('error', (e: Error) =>
        reject(e instanceof Error ? e : new Error(String(e))),
      );
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Header
      doc.fontSize(18).text('INVOICE', { align: 'right' });
      doc.moveDown(0.5);

      // Seller (use tenant id as placeholder)
      const tenant = getTenantId();
      doc.fontSize(10).text(`Seller (Tenant): ${tenant ?? 'N/A'}`);
      doc.moveDown(0.5);

      // Invoice meta
      doc.fontSize(12).text(`Number: ${inv.number ?? 'DRAFT'}`);
      doc.text(`Status: ${inv.status}`);
      doc.text(`Type: ${inv.type}`);
      doc.text(`Created: ${this.toStr(inv.createdAt)}`);
      doc.moveDown(0.5);

      // Client block
      doc.fontSize(12).text('Client');
      doc.fontSize(10);
      const clientName = inv.client?.denomination ?? inv.client?.name ?? 'N/A';
      doc.text(`Name: ${clientName}`);
      if (inv.client?.nif) doc.text(`NIF: ${inv.client.nif}`);
      if (inv.client?.refExo) doc.text(`RefExo: ${inv.client.refExo}`);
      doc.moveDown(0.5);

      // Lines table (simple)
      doc.fontSize(12).text('Lines');
      doc.fontSize(10);
      doc.text('Label                 Qty      Unit      Total TTC');
      doc.moveTo(doc.x, doc.y).lineTo(550, doc.y).stroke();
      for (const ln of inv.lines ?? []) {
        const label = ln.label ?? ln.kind ?? '';
        const qty = this.toStr(ln.qty);
        const unit = this.toStr(ln.unitPrice);
        const total = this.toStr(ln.totalTTC);
        doc.text(`${label}`);
        doc.text(`   ${qty} x ${unit} = ${total}`);
      }
      doc.moveDown(0.5);

      // Totals
      doc.fontSize(12).text('Totals');
      doc.fontSize(10);
      doc.text(`HT: ${this.toStr(inv.totals?.ht)}`);
      doc.text(`VAT: ${this.toStr(inv.totals?.vat)}`);
      doc.text(`TTC: ${this.toStr(inv.totals?.ttc)}`);
      if (inv.equivalentCurrency) {
        doc.text(
          `Eq (${inv.equivalentCurrency.code}): rate ${this.toStr(inv.equivalentCurrency.rate)}`,
        );
      }

      // DEF code and QR
      if (inv.security?.codeDefDgi) {
        doc.moveDown(0.5);
        doc.fontSize(12).text(`DEF: ${inv.security.codeDefDgi}`);
      }

      if (qrPng) {
        doc.image(qrPng, { width: 120, align: 'left' });
      }

      doc.end();
    });
  }
}
