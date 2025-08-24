import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LoggerModule } from 'nestjs-pino';
import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';
import { Role, RoleSchema } from './schemas/role.schema';
import { Membership, MembershipSchema } from '../memberships/membership.schema';

@Module({
  imports: [
    LoggerModule,
    MongooseModule.forFeature([
      { name: Role.name, schema: RoleSchema },
      { name: Membership.name, schema: MembershipSchema },
    ]),
  ],
  controllers: [RbacController],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}
