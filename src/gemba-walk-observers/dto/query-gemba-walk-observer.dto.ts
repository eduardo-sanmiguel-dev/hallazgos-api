import { CatalogVisibilityDto } from '../../shared/dto/catalog-visibility.dto.js';
import { IsOptional, IsPositive, IsString, IsInt } from 'class-validator';
import {
  IsSortColumn,
  IsSortOrder,
} from '../../shared/dto/sort-query.decorators.js';
import { sortKeys, type SortOrder } from '../../shared/utils/sort.js';

/** Columnas por las que el listado se puede ordenar (lista blanca). */
export const GEMBA_WALK_OBSERVER_SORT_COLUMNS = {
  id: 'id',
  user: 'user.name',
  manufacturingPlant: 'manufacturingPlant.name',
  nameZone: 'gembaWalkZone.nameZone',
  nameLocation: 'gembaWalkZone.nameLocation',
  createdBy: 'createdBy.name',
  updatedBy: 'updatedBy.name',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  isActive: 'isActive',
} as const;
export type GembaWalkObserverSortColumn =
  keyof typeof GEMBA_WALK_OBSERVER_SORT_COLUMNS;
export const GEMBA_WALK_OBSERVER_DEFAULT_SORT = {
  orderBy: 'id',
  order: 'desc',
} as const;

export class QueryGembaWalkObserverDto extends CatalogVisibilityDto {
  @IsOptional()
  @IsPositive()
  manufacturingPlantId?: number;

  @IsOptional()
  @IsPositive()
  gembaWalkZoneId?: number;

  @IsOptional()
  @IsString()
  userName?: string;

  @IsOptional()
  @IsPositive()
  readonly page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  readonly limit?: number;

  @IsSortColumn(sortKeys(GEMBA_WALK_OBSERVER_SORT_COLUMNS))
  orderBy?: GembaWalkObserverSortColumn;

  @IsSortOrder()
  order?: SortOrder;
}
