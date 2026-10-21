import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { EppsController } from './epps.controller.js';
import { Equipment } from '../equipments/entities/index.js';
import { Epp, EppEquipment } from './entities/index.js';
import { Employee } from '../employees/entities/index.js';
import { EppsService } from './epps.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Epp, EppEquipment, Employee, Equipment])],
  controllers: [EppsController],
  providers: [EppsService],
})
export class EppsModule {}
