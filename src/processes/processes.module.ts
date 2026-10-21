import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProcessesService } from './processes.service.js';
import { ProcessesController } from './processes.controller.js';
import { Processes } from './entities/processes.entity.js';
import { ManufacturingPlantsModule } from '../manufacturing-plants/manufacturing-plants.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Processes]), ManufacturingPlantsModule],
  controllers: [ProcessesController],
  providers: [ProcessesService],
  exports: [TypeOrmModule, ProcessesService],
})
export class ProcessesModule {}
