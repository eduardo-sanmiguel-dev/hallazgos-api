import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { EmergencyTeamsController } from './emergency-teams.controller.js';
import { EmergencyTeamsService } from './emergency-teams.service.js';
import { EmergencyTeam } from './entities/emergency-team.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([EmergencyTeam])],
  controllers: [EmergencyTeamsController],
  providers: [EmergencyTeamsService],
  exports: [TypeOrmModule, EmergencyTeamsService],
})
export class EmergencyTeamsModule {}
