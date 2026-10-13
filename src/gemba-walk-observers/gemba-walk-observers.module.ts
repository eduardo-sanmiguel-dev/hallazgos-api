import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { GembaWalkObserversController } from './gemba-walk-observers.controller';
import { GembaWalkObserversService } from './gemba-walk-observers.service';
import { GembaWalkObserver } from './entities/gemba-walk-observer.entity';
import { User } from 'users/entities/user.entity';
import { ManufacturingPlantsModule } from 'manufacturing-plants/manufacturing-plants.module';
import { GembaWalkZonesModule } from 'gemba-walk-zones/gemba-walk-zones.module';

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
