import { CatalogVisibilityDto } from '../../shared/dto/catalog-visibility.dto.js';
import { IsOptional, IsString, IsInt, IsPositive } from 'class-validator';
import {
  IsSortColumn,
  IsSortOrder,
} from '../../shared/dto/sort-query.decorators.js';
import { sortKeys, type SortOrder } from '../../shared/utils/sort.js';

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

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  limit?: number;

  @IsSortColumn(sortKeys(MANUFACTURING_PLANT_SORT_COLUMNS))
  orderBy?: ManufacturingPlantSortColumn;

  @IsSortOrder()
  order?: SortOrder;
}
