import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { QueryClientsDto } from './dto/query-clients.dto';

@ApiTags('Clients')
@ApiBearerAuth('bearer')
@Controller('clients')
export class ClientsController {
  constructor(private readonly service: ClientsService) {}

  @Get()
  @ApiOkResponse({ description: 'List clients with pagination' })
  async list(@Query() query: QueryClientsDto) {
    return this.service.list(query);
  }

  @Post()
  @ApiCreatedResponse({ description: 'Client created' })
  @ApiBadRequestResponse({
    description: 'Validation failed for type-specific requirements',
  })
  @ApiBody({
    type: CreateClientDto,
    examples: {
      PP: {
        summary: 'PP (Personne Physique) minimal',
        value: { type: 'PP', name: 'John Doe', email: 'john@example.com' },
      },
      PM: {
        summary: 'PM requires denomination + nif',
        value: { type: 'PM', denomination: 'ACME SARL', nif: 'A1234567C' },
      },
      PC: {
        summary: 'PC requires name + nif',
        value: { type: 'PC', name: 'Ecole Primaire', nif: 'B7654321Z' },
      },
      PL: {
        summary: 'PL requires name + nif',
        value: { type: 'PL', name: 'Dr. Kabila', nif: 'C1112223X' },
      },
      AO: {
        summary: 'AO requires name + refExo',
        value: { type: 'AO', name: 'Ambassade USA', refExo: 'EXO-12345' },
      },
    },
  })
  async create(@Body() dto: CreateClientDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Client detail' })
  async get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Client updated' })
  @ApiBadRequestResponse({
    description: 'Validation failed for type-specific requirements',
  })
  async update(@Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Client deleted' })
  async remove(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
