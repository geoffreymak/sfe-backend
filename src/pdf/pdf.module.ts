import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PdfService } from './pdf.service';
import { Invoice, InvoiceSchema } from '../invoices/invoice.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Invoice.name, schema: InvoiceSchema }]),
  ],
  providers: [PdfService],
  exports: [PdfService],
})
export class PdfModule {}
