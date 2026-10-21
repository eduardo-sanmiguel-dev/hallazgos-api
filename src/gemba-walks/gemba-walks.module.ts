import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { GembaWalksController } from './gemba-walks.controller.js';
import { GembaWalksService } from './gemba-walks.service.js';
import { GembaWalk } from './entities/gemba-walk.entity.js';
import { GembaWalkResult } from './entities/gemba-walk-result.entity.js';
import { GembaWalkCalendar } from '../gemba-walk-calendar/entities/gemba-walk-calendar.entity.js';
import { GembaWalkEvaluation } from '../gemba-walk-evaluations/entities/gemba-walk-evaluation.entity.js';
import { GembaWalkObserver } from '../gemba-walk-observers/entities/gemba-walk-observer.entity.js';
import { ManufacturingPlant } from '../manufacturing-plants/entities/manufacturing-plant.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GembaWalk,
      GembaWalkResult,
      GembaWalkCalendar,
      GembaWalkEvaluation,
      GembaWalkObserver,
      ManufacturingPlant,
    ]),
  ],
  controllers: [GembaWalksController],
  providers: [GembaWalksService],
})
export class GembaWalksModule {}
