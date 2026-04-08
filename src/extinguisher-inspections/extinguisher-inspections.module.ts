import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { ExtinguisherInspectionEvaluation } from './entities/extinguisher-inspection-evaluation.entity';
import { ExtinguisherInspectionsController } from './extinguisher-inspections.controller';
import { ExtinguisherInspectionsService } from './extinguisher-inspections.service';
import { ExtinguisherInspection } from './entities/extinguisher-inspection.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExtinguisherInspection,
      ExtinguisherInspectionEvaluation,
    ]),
  ],
  controllers: [ExtinguisherInspectionsController],
  providers: [ExtinguisherInspectionsService],
  exports: [TypeOrmModule, ExtinguisherInspectionsService],
})
export class ExtinguisherInspectionsModule {}
