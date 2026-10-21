import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { GembaWalkObserversController } from './gemba-walk-observers.controller.js';
import { GembaWalkObserversService } from './gemba-walk-observers.service.js';
import { GembaWalkObserver } from './entities/gemba-walk-observer.entity.js';
import { User } from '../users/entities/user.entity.js';
import { ManufacturingPlantsModule } from '../manufacturing-plants/manufacturing-plants.module.js';
import { GembaWalkZonesModule } from '../gemba-walk-zones/gemba-walk-zones.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([GembaWalkObserver, User]),
    ManufacturingPlantsModule,
    GembaWalkZonesModule,
  ],
  controllers: [GembaWalkObserversController],
  providers: [GembaWalkObserversService],
  exports: [TypeOrmModule, GembaWalkObserversService],
})
export class GembaWalkObserversModule {}
