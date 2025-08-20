import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';
import {
  LoyaltyTransaction,
  LoyaltyTransactionSchema,
} from './loyalty-transaction.schema';
import { ClientsModule } from '../clients/clients.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    ClientsModule,
    MongooseModule.forFeature([
      { name: LoyaltyTransaction.name, schema: LoyaltyTransactionSchema },
    ]),
    AuditModule,
  ],
  controllers: [LoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
