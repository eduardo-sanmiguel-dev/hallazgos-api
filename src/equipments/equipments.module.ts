import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { ManufacturingPlantsModule } from 'manufacturing-plants/manufacturing-plants.module';
import { EquipmentsController } from './equipments.controller';
import { Equipment, EquipmentCostHistory } from './entities';
import { EquipmentsService } from './equipments.service';

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
