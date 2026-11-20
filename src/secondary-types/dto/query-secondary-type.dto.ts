import { CatalogVisibilityDto } from '../../shared/dto/catalog-visibility.dto.js';
import { IsOptional, IsPositive, IsString } from 'class-validator';
import {
  IsSortColumn,
  IsSortOrder,
} from '../../shared/dto/sort-query.decorators.js';
import { sortKeys, type SortOrder } from '../../shared/utils/sort.js';
import { IsPageLimit } from '../../shared/dto/pagination.decorators.js';

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

  // De 1 a 100; -1 = todos (catálogo chico).
  @IsPageLimit({ allowAll: true })
  readonly limit?: number;

  @IsSortColumn(sortKeys(SECONDARY_TYPE_SORT_COLUMNS))
  orderBy?: SecondaryTypeSortColumn;

  @IsSortOrder()
  order?: SortOrder;
}
