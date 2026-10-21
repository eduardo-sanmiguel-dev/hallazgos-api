import { PartialType } from '@nestjs/mapped-types';
import { CreateGembaWalkEvaluationDto } from './create-gemba-walk-evaluation.dto.js';

export class UpdateGembaWalkEvaluationDto extends PartialType(
  CreateGembaWalkEvaluationDto,
) {}
