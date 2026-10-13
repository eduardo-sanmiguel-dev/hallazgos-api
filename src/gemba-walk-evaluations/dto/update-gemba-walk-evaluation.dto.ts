import { PartialType } from '@nestjs/mapped-types';
import { CreateGembaWalkEvaluationDto } from './create-gemba-walk-evaluation.dto';

export class UpdateGembaWalkEvaluationDto extends PartialType(
  CreateGembaWalkEvaluationDto,
) {}
