import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { applyMultiTenantPlugin } from '../../common/mongoose/multi-tenant.plugin';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { OnModuleInit } from '@nestjs/common';

class MongoosePluginInitializer implements OnModuleInit {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  onModuleInit() {
    applyMultiTenantPlugin(this.connection);
  }
}

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI')!,
      }),
    }),
  ],
  providers: [MongoosePluginInitializer],
})
export class DatabaseModule {}
