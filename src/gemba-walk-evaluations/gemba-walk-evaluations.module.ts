import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { GembaWalkEvaluationsController } from './gemba-walk-evaluations.controller';
import { GembaWalkEvaluationsService } from './gemba-walk-evaluations.service';
import { GembaWalkEvaluation } from './entities/gemba-walk-evaluation.entity';
import { ManufacturingPlantsModule } from 'manufacturing-plants/manufacturing-plants.module';

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
