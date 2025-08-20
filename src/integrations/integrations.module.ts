import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { IntegrationsController } from './integrations.controller';
import { EmcfHttpGateway } from './emcf/emcf.gateway';
import { McfSerialGateway } from './mcf/mcf.gateway';
import { OrchestratorController } from './orchestrator/orchestrator.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [SettingsModule, InvoicesModule, AuditModule],
  controllers: [IntegrationsController, OrchestratorController],
  providers: [EmcfHttpGateway, McfSerialGateway],
  exports: [EmcfHttpGateway, McfSerialGateway],
})
export class IntegrationsModule {}
