import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EvidencesService } from './evidences.service';
import { EvidencesController } from './evidences.controller';
import { Evidence } from './entities/evidence.entity';
import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { MainType } from 'main-types/entities/main-type.entity';
import { SecondaryType } from 'secondary-types/entities/secondary-type.entity';
import { Zone } from 'zones/entities/zone.entity';
import { Area } from 'areas/entities/area.entity';
import { Processes } from 'processes/entities/processes.entity';
import { User } from 'users/entities/user.entity';
import { ManufacturingPlantsModule } from 'manufacturing-plants/manufacturing-plants.module';
import { MainTypesModule } from 'main-types/main-types.module';
import { SecondaryTypesModule } from 'secondary-types/secondary-types.module';
import { ZonesModule } from 'zones/zones.module';
import { UsersModule } from 'users/users.module';
import { Comment } from './entities/comments.entity';
import { EvidencesResolver } from './evidences.resolver';
import { ProcessesModule } from 'processes/processes.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Evidence,
      Comment,
      ManufacturingPlant,
      MainType,
      SecondaryType,
      Zone,
      Area,
      Processes,
      User,
    ]),
    ManufacturingPlantsModule,
    MainTypesModule,
    SecondaryTypesModule,
    ZonesModule,
    UsersModule,
    ProcessesModule,
  ],
  controllers: [EvidencesController],
  providers: [EvidencesService, EvidencesResolver],
  exports: [TypeOrmModule, EvidencesService],
})
export class EvidencesModule {}
