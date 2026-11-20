import { CatalogVisibilityDto } from '../../shared/dto/catalog-visibility.dto.js';
import {
  IsSortColumn,
  IsSortOrder,
} from '../../shared/dto/sort-query.decorators.js';
import { sortKeys, type SortOrder } from '../../shared/utils/sort.js';
import { IsOptional, IsPositive, IsString } from 'class-validator';
import { IsPageLimit } from '../../shared/dto/pagination.decorators.js';

/** Columnas por las que el listado se puede ordenar (lista blanca). */
export const AREA_SORT_COLUMNS = {
  id: 'id',
  name: 'name',
  manufacturingPlant: 'manufacturingPlant.name',
  createdBy: 'createdBy.name',
  updatedBy: 'updatedBy.name',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  isActive: 'isActive',
} as const;
export type AreaSortColumn = keyof typeof AREA_SORT_COLUMNS;
export const AREA_DEFAULT_SORT = { orderBy: 'id', order: 'desc' } as const;

export class QueryAreaDto extends CatalogVisibilityDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsPositive()
  manufacturingPlantId?: number;

  @IsOptional()
  @IsPositive()
  page?: number;

  // De 1 a 100; -1 = todos (catálogo chico).
  @IsPageLimit({ allowAll: true })
  limit?: number;

  @IsSortColumn(sortKeys(AREA_SORT_COLUMNS))
  orderBy?: AreaSortColumn;

  @IsSortOrder()
  order?: SortOrder;
}
