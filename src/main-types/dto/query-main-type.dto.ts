import { CatalogVisibilityDto } from '../../shared/dto/catalog-visibility.dto.js';
import { IsOptional, IsString, IsInt, IsPositive } from 'class-validator';
import {
  IsSortColumn,
  IsSortOrder,
} from '../../shared/dto/sort-query.decorators.js';
import { sortKeys, type SortOrder } from '../../shared/utils/sort.js';

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

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  readonly limit?: number;

  @IsSortColumn(sortKeys(MAIN_TYPE_SORT_COLUMNS))
  orderBy?: MainTypeSortColumn;

  @IsSortOrder()
  order?: SortOrder;
}
