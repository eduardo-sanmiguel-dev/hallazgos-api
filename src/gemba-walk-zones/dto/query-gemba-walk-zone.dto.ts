import { CatalogVisibilityDto } from '../../shared/dto/catalog-visibility.dto.js';
import { IsOptional, IsPositive, IsString } from 'class-validator';
import {
  IsSortColumn,
  IsSortOrder,
} from '../../shared/dto/sort-query.decorators.js';
import { sortKeys, type SortOrder } from '../../shared/utils/sort.js';
import { IsPageLimit } from '../../shared/dto/pagination.decorators.js';

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

  // De 1 a 100; -1 = todos (catálogo chico).
  @IsPageLimit({ allowAll: true })
  readonly limit?: number;

  @IsSortColumn(sortKeys(GEMBA_WALK_ZONE_SORT_COLUMNS))
  orderBy?: GembaWalkZoneSortColumn;

  @IsSortOrder()
  order?: SortOrder;
}
