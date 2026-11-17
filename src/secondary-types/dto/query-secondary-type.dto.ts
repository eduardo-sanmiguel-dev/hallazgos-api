import { CatalogVisibilityDto } from '../../shared/dto/catalog-visibility.dto.js';
import { IsOptional, IsPositive, IsString, IsInt } from 'class-validator';
import {
  IsSortColumn,
  IsSortOrder,
} from '../../shared/dto/sort-query.decorators.js';
import { sortKeys, type SortOrder } from '../../shared/utils/sort.js';

/** Columnas por las que el listado se puede ordenar (lista blanca). */
export const SECONDARY_TYPE_SORT_COLUMNS = {
  id: 'id',
  name: 'name',
  mainType: 'mainType.name',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  isActive: 'isActive',
} as const;
export type SecondaryTypeSortColumn = keyof typeof SECONDARY_TYPE_SORT_COLUMNS;
export const SECONDARY_TYPE_DEFAULT_SORT = {
  orderBy: 'id',
  order: 'desc',
} as const;

export class QuerySecondaryTypeDto extends CatalogVisibilityDto {
  @IsOptional()
  @IsString()
  name: string;

  @IsOptional()
  @IsPositive()
  mainTypeId: number;

  @IsOptional()
  @IsPositive()
  readonly page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  readonly limit?: number;

  @IsSortColumn(sortKeys(SECONDARY_TYPE_SORT_COLUMNS))
  orderBy?: SecondaryTypeSortColumn;

  @IsSortOrder()
  order?: SortOrder;
}
