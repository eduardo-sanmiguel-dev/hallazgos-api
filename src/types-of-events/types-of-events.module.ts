import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { TypesOfEventsController } from './types-of-events.controller.js';
import { TypesOfEventsService } from './types-of-events.service.js';
import { TypesOfEvent } from './entities/types-of-event.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([TypesOfEvent])],
  controllers: [TypesOfEventsController],
  providers: [TypesOfEventsService],
  exports: [TypeOrmModule, TypesOfEventsService],
})
export class TypesOfEventsModule {}
