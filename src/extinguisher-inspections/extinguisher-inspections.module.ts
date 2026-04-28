import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { ExtinguisherInspectionEvaluation } from './entities/extinguisher-inspection-evaluation.entity';
import { ExtinguisherInspectionsController } from './extinguisher-inspections.controller';
import { ExtinguisherInspectionsService } from './extinguisher-inspections.service';
import { ExtinguisherInspection } from './entities/extinguisher-inspection.entity';
import { EmergencyTeam } from 'emergency-teams/entities/emergency-team.entity';

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
