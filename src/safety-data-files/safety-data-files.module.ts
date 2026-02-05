import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { SafetyDataFilesController } from './safety-data-files.controller';
import { SafetyDataFilesService } from './safety-data-files.service';
import { SafetyDataFile } from './entities/safety-data-file.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SafetyDataFile])],
  controllers: [SafetyDataFilesController],
  providers: [SafetyDataFilesService],
  exports: [TypeOrmModule, SafetyDataFilesService],
})
export class SafetyDataFilesModule {}
