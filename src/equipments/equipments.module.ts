import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { ManufacturingPlantsModule } from '../manufacturing-plants/manufacturing-plants.module.js';
import { EquipmentsController } from './equipments.controller.js';
import { Equipment, EquipmentCostHistory } from './entities/index.js';
import { EquipmentsService } from './equipments.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Equipment, EquipmentCostHistory]),
    ManufacturingPlantsModule,
  ],
  controllers: [EquipmentsController],
  providers: [EquipmentsService],
  exports: [TypeOrmModule, EquipmentsService],
})
export class EquipmentsModule {}
