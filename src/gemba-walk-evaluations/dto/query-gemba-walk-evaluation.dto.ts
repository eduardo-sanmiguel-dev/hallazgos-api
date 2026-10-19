import { IsIn, IsOptional, IsPositive, IsString, IsInt } from 'class-validator';

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

  @IsOptional()
  @IsPositive()
  readonly page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  readonly limit?: number;
}
