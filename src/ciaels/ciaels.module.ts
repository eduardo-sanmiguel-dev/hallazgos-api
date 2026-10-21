import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { ManufacturingPlant } from '../manufacturing-plants/entities/manufacturing-plant.entity.js';
import { AccidentPosition } from '../accident-positions/entities/accident-position.entity.js';
import { AssociatedTask } from '../associated-tasks/entities/associated-task.entity.js';
import { NatureOfEvent } from '../nature-of-events/entities/nature-of-event.entity.js';
import { TypeOfInjury } from '../type-of-injuries/entities/type-of-injury.entity.js';
import { TypesOfEvent } from '../types-of-events/entities/types-of-event.entity.js';
import { CieDiagnosis } from '../cie-diagnoses/entities/cie-diagnosis.entity.js';
import { AtMechanism } from '../at-mechanisms/entities/at-mechanism.entity.js';
import { TypeOfLink } from '../type-of-links/entities/type-of-link.entity.js';
import { WorkingDay } from '../working-days/entities/working-day.entity.js';
import { RiskFactor } from '../risk-factors/entities/risk-factor.entity.js';
import { BodyPart } from '../body-parts/entities/body-part.entity.js';
import { AtAgent } from '../at-agents/entities/at-agent.entity.js';
import { Country } from '../countries/entities/country.entity.js';
import { Machine } from '../machines/entities/machine.entity.js';
import { CiaelsController } from './ciaels.controller.js';
import { User } from '../users/entities/user.entity.js';
import { Zone } from '../zones/entities/zone.entity.js';
import { Area } from '../areas/entities/area.entity.js';
import { CiaelsService } from './ciaels.service.js';
import { Ciael } from './entities/ciael.entity.js';
import { Employee, EmployeeArea } from '../employees/entities/index.js';
import { Genre } from '../genres/entities/genre.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Ciael,
      Area,
      ManufacturingPlant,
      TypesOfEvent,
      Employee,
      CieDiagnosis,
      Zone,
      BodyPart,
      TypeOfInjury,
      AtMechanism,
      WorkingDay,
      TypeOfLink,
      AccidentPosition,
      Machine,
      AssociatedTask,
      User,
      RiskFactor,
      NatureOfEvent,
      AtAgent,
      Country,
      Genre,
      EmployeeArea,
    ]),
  ],
  controllers: [CiaelsController],
  providers: [CiaelsService],
  exports: [TypeOrmModule, CiaelsService],
})
export class CiaelsModule {}
