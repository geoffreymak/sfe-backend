import { BadRequestException, Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SettingsService } from '../settings/settings.service';
import { getTenantId } from '../common/logger/request-context';
import { EmcfHttpGateway } from './emcf/emcf.gateway';
import { McfSerialGateway } from './mcf/mcf.gateway';

@ApiTags('Integrations')
@ApiBearerAuth('bearer')
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly emcf: EmcfHttpGateway,
    private readonly mcf: McfSerialGateway,
  ) {}

  @Get('status')
  @ApiOkResponse({ description: 'Integration status summary by current mode' })
  async status(): Promise<unknown> {
    const tenantId = getTenantId();
    if (!tenantId) throw new BadRequestException('Missing tenant context');
    const settings = await this.settingsService.get(tenantId);
    const mode = settings.integration?.mode ?? 'mock';

    if (mode === 'emcf') {
      return { mode, emcf: this.emcf.status(settings.integration?.emcf) };
    }
    if (mode === 'mcf') {
      return { mode, mcf: this.mcf.statusMinimal(settings.integration?.mcf) };
    }
    return { mode: 'mock', ok: true };
  }
}
