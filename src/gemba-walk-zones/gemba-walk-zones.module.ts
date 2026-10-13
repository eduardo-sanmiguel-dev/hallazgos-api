import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { GembaWalkZonesController } from './gemba-walk-zones.controller';
import { GembaWalkZonesService } from './gemba-walk-zones.service';
import { GembaWalkZone } from './entities/gemba-walk-zone.entity';
import { ManufacturingPlantsModule } from 'manufacturing-plants/manufacturing-plants.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GembaWalkZone]),
    ManufacturingPlantsModule,
  ],
  controllers: [GembaWalkZonesController],
  providers: [GembaWalkZonesService],
  exports: [TypeOrmModule, GembaWalkZonesService],
})
export class GembaWalkZonesModule {}
