import { PartialType } from '@nestjs/mapped-types';
import { CreateGembaWalkZoneDto } from './create-gemba-walk-zone.dto.js';

export class UpdateGembaWalkZoneDto extends PartialType(
  CreateGembaWalkZoneDto,
) {}
