import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Invoice,
  InvoiceSchema,
  InvoiceCounter,
  InvoiceCounterSchema,
} from './invoice.schema';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { SettingsModule } from '../settings/settings.module';
import { FxModule } from '../fx/fx.module';
import { PdfModule } from '../pdf/pdf.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Invoice.name, schema: InvoiceSchema },
      { name: InvoiceCounter.name, schema: InvoiceCounterSchema },
    ]),
    SettingsModule,
    FxModule,
    PdfModule,
    AuditModule,
  ],
  providers: [InvoicesService],
  controllers: [InvoicesController],
  exports: [InvoicesService, MongooseModule],
})
export class InvoicesModule {}
