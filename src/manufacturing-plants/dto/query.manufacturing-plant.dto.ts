import { CatalogVisibilityDto } from '../../shared/dto/catalog-visibility.dto.js';
import { IsOptional, IsString, IsPositive } from 'class-validator';
import {
  IsSortColumn,
  IsSortOrder,
} from '../../shared/dto/sort-query.decorators.js';
import { sortKeys, type SortOrder } from '../../shared/utils/sort.js';
import { IsPageLimit } from '../../shared/dto/pagination.decorators.js';

/** Columnas por las que el listado se puede ordenar (lista blanca). */
export const MANUFACTURING_PLANT_SORT_COLUMNS = {
  id: 'id',
  name: 'name',
  lat: 'lat',
  lng: 'lng',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  isActive: 'isActive',
} as const;
export type ManufacturingPlantSortColumn =
  keyof typeof MANUFACTURING_PLANT_SORT_COLUMNS;
export const MANUFACTURING_PLANT_DEFAULT_SORT = {
  orderBy: 'id',
  order: 'desc',
} as const;

export class QueryManufacturingPlantDto extends CatalogVisibilityDto {
  @IsOptional()
  @IsString()
  name: string;

  @IsOptional()
  @IsPositive()
  page?: number;

  // De 1 a 100; -1 = todos (catálogo chico).
  @IsPageLimit({ allowAll: true })
  limit?: number;

  @IsSortColumn(sortKeys(MANUFACTURING_PLANT_SORT_COLUMNS))
  orderBy?: ManufacturingPlantSortColumn;

  @IsSortOrder()
  order?: SortOrder;
}
