import { PartialType } from '@nestjs/mapped-types';
import { CreateGembaWalkZoneDto } from './create-gemba-walk-zone.dto';

export class UpdateGembaWalkZoneDto extends PartialType(
  CreateGembaWalkZoneDto,
) {}
