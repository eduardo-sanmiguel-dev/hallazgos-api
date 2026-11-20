import { CatalogVisibilityDto } from '../../shared/dto/catalog-visibility.dto.js';
import { IsOptional, IsString, IsPositive } from 'class-validator';
import {
  IsSortColumn,
  IsSortOrder,
} from '../../shared/dto/sort-query.decorators.js';
import { sortKeys, type SortOrder } from '../../shared/utils/sort.js';
import { IsPageLimit } from '../../shared/dto/pagination.decorators.js';

/** Columnas por las que el listado se puede ordenar (lista blanca). */
export const MAIN_TYPE_SORT_COLUMNS = {
  id: 'id',
  name: 'name',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  isActive: 'isActive',
} as const;
export type MainTypeSortColumn = keyof typeof MAIN_TYPE_SORT_COLUMNS;
export const MAIN_TYPE_DEFAULT_SORT = {
  orderBy: 'id',
  order: 'desc',
} as const;

export class QueryMainTypeDto extends CatalogVisibilityDto {
  @IsOptional()
  @IsString()
  name: string;

  @IsOptional()
  @IsPositive()
  readonly page?: number;

  // De 1 a 100; -1 = todos (catálogo chico).
  @IsPageLimit({ allowAll: true })
  readonly limit?: number;

  @IsSortColumn(sortKeys(MAIN_TYPE_SORT_COLUMNS))
  orderBy?: MainTypeSortColumn;

  @IsSortOrder()
  order?: SortOrder;
}
