import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { GembaWalkEvaluationsController } from './gemba-walk-evaluations.controller.js';
import { GembaWalkEvaluationsService } from './gemba-walk-evaluations.service.js';
import { GembaWalkEvaluation } from './entities/gemba-walk-evaluation.entity.js';
import { ManufacturingPlantsModule } from '../manufacturing-plants/manufacturing-plants.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([GembaWalkEvaluation]),
    ManufacturingPlantsModule,
  ],
  controllers: [GembaWalkEvaluationsController],
  providers: [GembaWalkEvaluationsService],
  exports: [TypeOrmModule, GembaWalkEvaluationsService],
})
export class GembaWalkEvaluationsModule {}
