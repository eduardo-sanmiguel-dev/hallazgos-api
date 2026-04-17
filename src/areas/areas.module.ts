import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { AreasController } from './areas.controller';
import { AreasService } from './areas.service';
import { Area } from './entities/area.entity';
import { ManufacturingPlantsModule } from 'manufacturing-plants/manufacturing-plants.module';

@Module({
  imports: [TypeOrmModule.forFeature([Area]), ManufacturingPlantsModule],
  controllers: [AreasController],
  providers: [AreasService],
  exports: [TypeOrmModule, AreasService],
})
export class AreasModule {}
