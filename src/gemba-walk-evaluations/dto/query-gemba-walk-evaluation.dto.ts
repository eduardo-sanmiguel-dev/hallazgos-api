import { CatalogVisibilityDto } from '../../shared/dto/catalog-visibility.dto.js';
import { IsIn, IsOptional, IsPositive, IsString } from 'class-validator';

import { GEMBA_WALK_EVALUATION_CATEGORIES } from '../gemba-walk-evaluation-categories.js';
import {
  IsSortColumn,
  IsSortOrder,
} from '../../shared/dto/sort-query.decorators.js';
import { sortKeys, type SortOrder } from '../../shared/utils/sort.js';
import { IsPageLimit } from '../../shared/dto/pagination.decorators.js';

/** Columnas por las que el listado se puede ordenar (lista blanca). */
export const GEMBA_WALK_EVALUATION_SORT_COLUMNS = {
  id: 'id',
  area: 'area',
  category: 'category',
  description: 'description',
  manufacturingPlant: 'manufacturingPlant.name',
  createdBy: 'createdBy.name',
  updatedBy: 'updatedBy.name',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  isActive: 'isActive',
} as const;
export type GembaWalkEvaluationSortColumn =
  keyof typeof GEMBA_WALK_EVALUATION_SORT_COLUMNS;
export const GEMBA_WALK_EVALUATION_DEFAULT_SORT = {
  orderBy: 'id',
  order: 'desc',
} as const;

export class QueryGembaWalkEvaluationDto extends CatalogVisibilityDto {
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

  // De 1 a 100; -1 = todos (catálogo chico).
  @IsPageLimit({ allowAll: true })
  readonly limit?: number;

  @IsSortColumn(sortKeys(GEMBA_WALK_EVALUATION_SORT_COLUMNS))
  orderBy?: GembaWalkEvaluationSortColumn;

  @IsSortOrder()
  order?: SortOrder;
}
