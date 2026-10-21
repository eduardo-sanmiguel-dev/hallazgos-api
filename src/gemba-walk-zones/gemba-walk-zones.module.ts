import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { GembaWalkZonesController } from './gemba-walk-zones.controller.js';
import { GembaWalkZonesService } from './gemba-walk-zones.service.js';
import { GembaWalkZone } from './entities/gemba-walk-zone.entity.js';
import { ManufacturingPlantsModule } from '../manufacturing-plants/manufacturing-plants.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([GembaWalkZone]),
    ManufacturingPlantsModule,
  ],
  controllers: [GembaWalkZonesController],
  providers: [GembaWalkZonesService],
  exports: [TypeOrmModule, GembaWalkZonesService],
})
export class GembaWalkZonesModule {}
