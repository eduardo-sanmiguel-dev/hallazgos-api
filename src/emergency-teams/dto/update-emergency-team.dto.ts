import { PartialType } from '@nestjs/mapped-types';

import { CreateEmergencyTeamDto } from './create-emergency-team.dto';

export class UpdateEmergencyTeamDto extends PartialType(
  CreateEmergencyTeamDto,
) {}
