import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ZonesService } from './zones.service.js';
import { ZonesController } from './zones.controller.js';
import { Zone } from './entities/zone.entity.js';
import { ManufacturingPlantsModule } from '../manufacturing-plants/manufacturing-plants.module.js';
import { AreasModule } from '../areas/areas.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Zone]),
    ManufacturingPlantsModule,
    AreasModule,
  ],
  controllers: [ZonesController],
  providers: [ZonesService],
  exports: [TypeOrmModule, ZonesService],
})
export class ZonesModule {}
