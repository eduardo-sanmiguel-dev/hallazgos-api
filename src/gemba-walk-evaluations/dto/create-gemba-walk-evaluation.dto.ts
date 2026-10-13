import { IsIn, IsNotEmpty, IsPositive, IsString } from 'class-validator';

import { GEMBA_WALK_EVALUATION_CATEGORIES } from '../gemba-walk-evaluation-categories';

export class CreateGembaWalkEvaluationDto {
  @IsNotEmpty()
  @IsPositive()
  manufacturingPlantId: number;

  @IsNotEmpty()
  @IsString()
  area: string;

  @IsNotEmpty()
  @IsIn(GEMBA_WALK_EVALUATION_CATEGORIES)
  category: string;

  @IsNotEmpty()
  @IsString()
  description: string;
}
