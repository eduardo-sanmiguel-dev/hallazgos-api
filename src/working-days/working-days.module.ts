import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { WorkingDaysController } from './working-days.controller.js';
import { WorkingDaysService } from './working-days.service.js';
import { WorkingDay } from './entities/working-day.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([WorkingDay])],
  controllers: [WorkingDaysController],
  providers: [WorkingDaysService],
  exports: [TypeOrmModule, WorkingDaysService],
})
export class WorkingDaysModule {}
