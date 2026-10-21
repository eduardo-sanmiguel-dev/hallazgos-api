import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { CieDiagnosesController } from './cie-diagnoses.controller.js';
import { CieDiagnosesService } from './cie-diagnoses.service.js';
import { CieDiagnosis } from './entities/cie-diagnosis.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([CieDiagnosis])],
  controllers: [CieDiagnosesController],
  providers: [CieDiagnosesService],
  exports: [TypeOrmModule, CieDiagnosesService],
})
export class CieDiagnosesModule {}
