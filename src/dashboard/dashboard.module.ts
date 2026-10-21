import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DashboardService } from './dashboard.service.js';
import { DashboardController } from './dashboard.controller.js';
import { ManufacturingPlant } from '../manufacturing-plants/entities/manufacturing-plant.entity.js';
import { AccidentRate } from './entities/accident-rate.entity.js';
import { Evidence } from '../evidences/entities/evidence.entity.js';
import { MainType } from '../main-types/entities/main-type.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ManufacturingPlant,
      AccidentRate,
      Evidence,
      MainType,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [TypeOrmModule, DashboardService],
})
export class DashboardModule {}
