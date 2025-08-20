import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Stock, StockSchema } from './stock.schema';
import { StockBatch, StockBatchSchema } from './stock-batch.schema';
import { StockSerial, StockSerialSchema } from './stock-serial.schema';
import { StockMovement, StockMovementSchema } from './stock-movement.schema';
import { StockService } from './stock.service';
import { StockController } from './stock.controller';
import { ItemsModule } from '../items/items.module';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { SettingsModule } from '../settings/settings.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Stock.name, schema: StockSchema },
      { name: StockBatch.name, schema: StockBatchSchema },
      { name: StockSerial.name, schema: StockSerialSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
    ]),
    ItemsModule,
    WarehousesModule,
    SettingsModule,
    AuditModule,
  ],
  providers: [StockService],
  controllers: [StockController],
  exports: [StockService],
})
export class StockModule {}
