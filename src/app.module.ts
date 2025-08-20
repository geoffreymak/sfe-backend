import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './core/database/database.module';
import { AuthModule } from './auth/auth.module';
import { SettingsModule } from './settings/settings.module';
import { CurrenciesModule } from './currencies/currencies.module';
import { FxModule } from './fx/fx.module';
import { ClientsModule } from './clients/clients.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { ItemsModule } from './items/items.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { StockModule } from './stock/stock.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { InvoicesModule } from './invoices/invoices.module';
import { ReportsModule } from './reports/reports.module';
import { PdfModule } from './pdf/pdf.module';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        quietReqLogger: true,
        genReqId: (req: { headers?: Record<string, unknown> }) => {
          const headers: Record<string, unknown> = req?.headers ?? {};
          const candidate = headers['x-request-id'] ?? headers['x-requestid'];
          return typeof candidate === 'string' && candidate.length > 0
            ? candidate
            : randomUUID();
        },
        serializers: {
          // Omit req/res objects for compact logs
          req: () => undefined,
          res: () => undefined,
        },
        customAttributeKeys: {
          responseTime: 'responseTimeMs',
        },
        customProps: (
          req: IncomingMessage & { id?: string; url?: string; method?: string },
          res: ServerResponse & { statusCode?: number },
        ) => ({
          requestId: req?.id,
          path: req?.url,
          method: req?.method,
          status: res?.statusCode,
        }),
        redact: {
          paths: [
            'req.headers.authorization',
            'req.body.password',
            'req.body.email',
            'req.body.phone',
            'req.body.nif',
            'req.body.refExo',
          ],
          censor: '[REDACTED]',
        },
      },
    }),
    DatabaseModule,
    AuthModule,
    HealthModule,
    SettingsModule,
    CurrenciesModule,
    FxModule,
    ClientsModule,
    LoyaltyModule,
    ItemsModule,
    WarehousesModule,
    StockModule,
    InvoicesModule,
    IntegrationsModule,
    ReportsModule,
    PdfModule,
    AuditModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
