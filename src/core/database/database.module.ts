import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { applyMultiTenantPlugin } from '../../common/mongoose/multi-tenant.plugin';
import type { Connection } from 'mongoose';
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI')!,
        connectionFactory: (connection: Connection): Connection => {
          // Ensure the multi-tenant plugin is applied before any models are compiled
          applyMultiTenantPlugin(connection);
          return connection;
        },
      }),
    }),
  ],
  providers: [],
})
export class DatabaseModule {}
