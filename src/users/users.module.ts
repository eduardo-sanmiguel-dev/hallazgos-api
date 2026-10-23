import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsersService } from './users.service.js';
import { E2eUserSeedService } from './e2e-user-seed.service.js';
import { UsersController } from './users.controller.js';
import { User } from './entities/user.entity.js';
import { ManufacturingPlantsModule } from '../manufacturing-plants/manufacturing-plants.module.js';
import { ZonesModule } from '../zones/zones.module.js';
import { ProcessesModule } from '../processes/processes.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    ManufacturingPlantsModule,
    ZonesModule,
    ProcessesModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, E2eUserSeedService],
  exports: [TypeOrmModule, UsersService],
})
export class UsersModule {}
