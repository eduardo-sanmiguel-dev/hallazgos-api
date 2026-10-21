import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { GembaWalkCalendarController } from './gemba-walk-calendar.controller.js';
import { GembaWalkCalendarService } from './gemba-walk-calendar.service.js';
import { GembaWalkCalendar } from './entities/gemba-walk-calendar.entity.js';
import { GembaWalkZonesModule } from '../gemba-walk-zones/gemba-walk-zones.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([GembaWalkCalendar]),
    GembaWalkZonesModule,
  ],
  controllers: [GembaWalkCalendarController],
  providers: [GembaWalkCalendarService],
  exports: [TypeOrmModule, GembaWalkCalendarService],
})
export class GembaWalkCalendarModule {}
