import { IsIn, IsOptional, IsPositive, IsString } from 'class-validator';

import { GEMBA_WALK_EVALUATION_CATEGORIES } from '../gemba-walk-evaluation-categories';

export class QueryGembaWalkEvaluationDto {
  @IsOptional()
  @IsPositive()
  manufacturingPlantId?: number;

  @IsOptional()
  @IsIn(GEMBA_WALK_EVALUATION_CATEGORIES)
  category?: string;

  // Busca en área o descripción.
  @IsOptional()
  @IsString()
  search?: string;
}
