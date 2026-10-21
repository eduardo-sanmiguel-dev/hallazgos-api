import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { AreasController } from './areas.controller.js';
import { AreasService } from './areas.service.js';
import { Area } from './entities/area.entity.js';
import { ManufacturingPlantsModule } from '../manufacturing-plants/manufacturing-plants.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Area]), ManufacturingPlantsModule],
  controllers: [AreasController],
  providers: [AreasService],
  exports: [TypeOrmModule, AreasService],
})
export class AreasModule {}
