import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

@ApiTags('Warehouses')
@ApiBearerAuth('bearer')
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly service: WarehousesService) {}

  @Get()
  @ApiOkResponse({ description: 'List warehouses' })
  async list() {
    return this.service.list();
  }

  @Post()
  @ApiCreatedResponse({ description: 'Warehouse created' })
  async create(@Body() dto: CreateWarehouseDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Warehouse detail' })
  async get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Warehouse updated' })
  async update(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Warehouse deleted' })
  async remove(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
