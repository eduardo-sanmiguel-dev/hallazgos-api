import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { AccidentRate } from './entities/accident-rate.entity';
import { Evidence } from 'evidences/entities/evidence.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ManufacturingPlant, AccidentRate, Evidence]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [TypeOrmModule, DashboardService],
})
export class DashboardModule {}
