import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { EmergencyTeam } from 'emergency-teams/entities/emergency-team.entity';
import { ExtinguisherInspectionEvaluation } from './entities/extinguisher-inspection-evaluation.entity';
import { ExtinguisherInspectionsController } from './extinguisher-inspections.controller';
import { ExtinguisherInspectionsSeedService } from './extinguisher-inspections-seed.service';
import { ExtinguisherInspectionsService } from './extinguisher-inspections.service';
import { ExtinguisherInspection } from './entities/extinguisher-inspection.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExtinguisherInspection,
      ExtinguisherInspectionEvaluation,
      EmergencyTeam,
    ]),
  ],
  controllers: [ExtinguisherInspectionsController],
  providers: [
    ExtinguisherInspectionsService,
    ExtinguisherInspectionsSeedService,
  ],
  exports: [TypeOrmModule, ExtinguisherInspectionsService],
})
export class ExtinguisherInspectionsModule {}
