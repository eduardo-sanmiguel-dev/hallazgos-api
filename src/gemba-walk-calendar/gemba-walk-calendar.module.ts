import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { GembaWalkCalendarController } from './gemba-walk-calendar.controller';
import { GembaWalkCalendarService } from './gemba-walk-calendar.service';
import { GembaWalkCalendar } from './entities/gemba-walk-calendar.entity';
import { GembaWalkZonesModule } from 'gemba-walk-zones/gemba-walk-zones.module';

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
