import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { Employee, EmployeeArea, EmployeePosition } from './entities/index.js';
import { EmployeesController } from './employees.controller.js';
import { EmployeesService } from './employees.service.js';
import { Genre } from '../genres/entities/genre.entity.js';
import { Zone } from '../zones/entities/zone.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      EmployeeArea,
      EmployeePosition,
      Genre,
      Zone,
    ]),
  ],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [TypeOrmModule, EmployeesService],
})
export class EmployeesModule {}
