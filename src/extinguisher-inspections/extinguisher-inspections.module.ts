import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { ExtinguisherInspectionEvaluation } from './entities/extinguisher-inspection-evaluation.entity.js';
import { ExtinguisherInspectionsController } from './extinguisher-inspections.controller.js';
import { ExtinguisherInspectionsService } from './extinguisher-inspections.service.js';
import { ExtinguisherInspection } from './entities/extinguisher-inspection.entity.js';
import { EmergencyTeam } from '../emergency-teams/entities/emergency-team.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExtinguisherInspection,
      ExtinguisherInspectionEvaluation,
      EmergencyTeam,
    ]),
  ],
  controllers: [ExtinguisherInspectionsController],
  providers: [ExtinguisherInspectionsService],
  exports: [TypeOrmModule, ExtinguisherInspectionsService],
})
export class ExtinguisherInspectionsModule {}
