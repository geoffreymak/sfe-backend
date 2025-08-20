import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FxRate, FxRateSchema } from './fx-rate.schema';
import { FxService } from './fx.service';
import { FxController } from './fx.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: FxRate.name, schema: FxRateSchema }]),
  ],
  providers: [FxService],
  controllers: [FxController],
  exports: [FxService],
})
export class FxModule {}
