import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EvidencesService } from './evidences.service.js';
import { EvidencesController } from './evidences.controller.js';
import { Evidence } from './entities/evidence.entity.js';
import { ManufacturingPlant } from '../manufacturing-plants/entities/manufacturing-plant.entity.js';
import { MainType } from '../main-types/entities/main-type.entity.js';
import { SecondaryType } from '../secondary-types/entities/secondary-type.entity.js';
import { Zone } from '../zones/entities/zone.entity.js';
import { Area } from '../areas/entities/area.entity.js';
import { Processes } from '../processes/entities/processes.entity.js';
import { User } from '../users/entities/user.entity.js';
import { ManufacturingPlantsModule } from '../manufacturing-plants/manufacturing-plants.module.js';
import { MainTypesModule } from '../main-types/main-types.module.js';
import { SecondaryTypesModule } from '../secondary-types/secondary-types.module.js';
import { ZonesModule } from '../zones/zones.module.js';
import { UsersModule } from '../users/users.module.js';
import { Comment } from './entities/comments.entity.js';
import { EvidencesResolver } from './evidences.resolver.js';
import { ProcessesModule } from '../processes/processes.module.js';

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
