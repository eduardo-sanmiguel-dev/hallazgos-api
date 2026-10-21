import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { NatureOfEventsController } from './nature-of-events.controller.js';
import { NatureOfEventsService } from './nature-of-events.service.js';
import { NatureOfEvent } from './entities/nature-of-event.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([NatureOfEvent])],
  controllers: [NatureOfEventsController],
  providers: [NatureOfEventsService],
  exports: [TypeOrmModule, NatureOfEventsService],
})
export class NatureOfEventsModule {}
