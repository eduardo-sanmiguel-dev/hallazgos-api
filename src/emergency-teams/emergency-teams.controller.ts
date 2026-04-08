import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';

import {
  CreateEmergencyTeamDto,
  QueryEmergencyTeamDto,
  UpdateEmergencyTeamDto,
} from './dto';
import { EmergencyTeamsService } from './emergency-teams.service';

@Controller('emergency-teams')
export class EmergencyTeamsController {
  constructor(private readonly emergencyTeamsService: EmergencyTeamsService) {}

  @Post()
  create(@Body() createEmergencyTeamDto: CreateEmergencyTeamDto) {
    return this.emergencyTeamsService.create(createEmergencyTeamDto);
  }

  @Get()
  findAll(@Query() queryEmergencyTeamDto: QueryEmergencyTeamDto) {
    return this.emergencyTeamsService.findAll(queryEmergencyTeamDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.emergencyTeamsService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateEmergencyTeamDto: UpdateEmergencyTeamDto,
  ) {
    return this.emergencyTeamsService.update(+id, updateEmergencyTeamDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.emergencyTeamsService.remove(+id);
  }
}
