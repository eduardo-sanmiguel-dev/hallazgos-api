import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { SafetyDataFilesController } from './safety-data-files.controller.js';
import { SafetyDataFilesService } from './safety-data-files.service.js';
import { SafetyDataFile } from './entities/safety-data-file.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([SafetyDataFile])],
  controllers: [SafetyDataFilesController],
  providers: [SafetyDataFilesService],
  exports: [TypeOrmModule, SafetyDataFilesService],
})
export class SafetyDataFilesModule {}
