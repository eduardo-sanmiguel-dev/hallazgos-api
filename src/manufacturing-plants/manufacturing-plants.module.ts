import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ManufacturingPlantsService } from './manufacturing-plants.service.js';
import { ManufacturingPlantsController } from './manufacturing-plants.controller.js';
import { ManufacturingPlant } from './entities/manufacturing-plant.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([ManufacturingPlant])],
  controllers: [ManufacturingPlantsController],
  providers: [ManufacturingPlantsService],
  exports: [TypeOrmModule, ManufacturingPlantsService],
})
export class ManufacturingPlantsModule {}
