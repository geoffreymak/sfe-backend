import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Item, ItemSchema } from './item.schema';
import { ItemsService } from './items.service';
import { ItemsController } from './items.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Item.name, schema: ItemSchema }]),
    AuditModule,
  ],
  providers: [ItemsService],
  controllers: [ItemsController],
  exports: [ItemsService, MongooseModule],
})
export class ItemsModule {}
