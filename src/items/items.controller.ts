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
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ItemsService } from './items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { QueryItemsDto } from './dto/query-items.dto';

@ApiTags('Items')
@ApiBearerAuth('bearer')
@Controller('items')
export class ItemsController {
  constructor(private readonly service: ItemsService) {}

  @Get()
  @ApiOkResponse({ description: 'List items with pagination and search' })
  async list(@Query() query: QueryItemsDto) {
    return this.service.list(query);
  }

  @Post()
  @ApiCreatedResponse({ description: 'Item created' })
  @ApiBadRequestResponse({
    description: 'Validation failed: price XOR or TAX group constraint',
  })
  @ApiBody({
    type: CreateItemDto,
    examples: {
      BIE_B: {
        summary: 'BIE (Bien) groupe B',
        value: {
          code: 'SKU-001',
          name: 'Stylo bille bleu',
          type: 'BIE',
          unit: 'pcs',
          taxGroupDefault: 'B',
          priceHT: '1000.00',
          stockTracking: 'simple',
        },
      },
      SER_C: {
        summary: 'SER (Service) groupe C',
        value: {
          code: 'SER-001',
          name: 'Installation sur site',
          type: 'SER',
          unit: 'hrs',
          taxGroupDefault: 'C',
          priceTTC: '108.00',
        },
      },
      TAX_L_valid: {
        summary: 'TAX (Parafiscale) groupe L - valide',
        value: {
          code: 'TAX-L-01',
          name: 'Taxe parafiscale L',
          type: 'TAX',
          unit: 'u',
          taxGroupDefault: 'L',
          priceTTC: '10.00',
        },
      },
      TAX_B_invalid: {
        summary: 'TAX groupe B - 400 attendu',
        value: {
          code: 'TAX-B-01',
          name: 'Taxe invalide',
          type: 'TAX',
          unit: 'u',
          taxGroupDefault: 'B',
          priceHT: '10.00',
        },
      },
    },
  })
  async create(@Body() dto: CreateItemDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Item detail' })
  async get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Item updated' })
  @ApiBadRequestResponse({
    description: 'Validation failed: price XOR or TAX group constraint',
  })
  async update(@Param('id') id: string, @Body() dto: UpdateItemDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Item deleted' })
  async remove(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
