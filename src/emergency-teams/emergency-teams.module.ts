import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { EmergencyTeamsSeedService } from './emergency-teams-seed.service';
import { EmergencyTeamsController } from './emergency-teams.controller';
import { EmergencyTeamsService } from './emergency-teams.service';
import { EmergencyTeam } from './entities/emergency-team.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EmergencyTeam])],
  controllers: [EmergencyTeamsController],
  providers: [EmergencyTeamsService, EmergencyTeamsSeedService],
  exports: [TypeOrmModule, EmergencyTeamsService],
})
export class EmergencyTeamsModule {}
