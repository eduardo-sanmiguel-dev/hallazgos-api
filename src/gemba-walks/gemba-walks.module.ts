import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { GembaWalksController } from './gemba-walks.controller';
import { GembaWalksService } from './gemba-walks.service';
import { GembaWalk } from './entities/gemba-walk.entity';
import { GembaWalkResult } from './entities/gemba-walk-result.entity';
import { GembaWalkCalendar } from 'gemba-walk-calendar/entities/gemba-walk-calendar.entity';
import { GembaWalkEvaluation } from 'gemba-walk-evaluations/entities/gemba-walk-evaluation.entity';
import { GembaWalkObserver } from 'gemba-walk-observers/entities/gemba-walk-observer.entity';
import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';

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
