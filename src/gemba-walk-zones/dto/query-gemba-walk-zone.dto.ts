import { CatalogVisibilityDto } from '../../shared/dto/catalog-visibility.dto.js';
import { IsOptional, IsPositive, IsString, IsInt } from 'class-validator';
import {
  IsSortColumn,
  IsSortOrder,
} from '../../shared/dto/sort-query.decorators.js';
import { sortKeys, type SortOrder } from '../../shared/utils/sort.js';

/** Columnas por las que el listado se puede ordenar (lista blanca). */
export const GEMBA_WALK_ZONE_SORT_COLUMNS = {
  id: 'id',
  nameZone: 'nameZone',
  nameLocation: 'nameLocation',
  manufacturingPlant: 'manufacturingPlant.name',
  createdBy: 'createdBy.name',
  updatedBy: 'updatedBy.name',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  isActive: 'isActive',
} as const;
export type GembaWalkZoneSortColumn = keyof typeof GEMBA_WALK_ZONE_SORT_COLUMNS;
export const GEMBA_WALK_ZONE_DEFAULT_SORT = {
  orderBy: 'id',
  order: 'desc',
} as const;

export class QueryGembaWalkZoneDto extends CatalogVisibilityDto {
  @IsOptional()
  @IsString()
  nameZone?: string;

  @IsOptional()
  @IsString()
  nameLocation?: string;

  @IsOptional()
  @IsPositive()
  manufacturingPlantId?: number;

  @IsOptional()
  @IsPositive()
  readonly page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  readonly limit?: number;

  @IsSortColumn(sortKeys(GEMBA_WALK_ZONE_SORT_COLUMNS))
  orderBy?: GembaWalkZoneSortColumn;

  @IsSortOrder()
  order?: SortOrder;
}
