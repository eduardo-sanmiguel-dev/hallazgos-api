import { CatalogVisibilityDto } from '../../shared/dto/catalog-visibility.dto.js';
import {
  IsISO8601,
  IsOptional,
  IsPositive,
  Matches,
  IsInt,
  IsBooleanString,
} from 'class-validator';

import { ISO_WITH_OFFSET } from './iso-with-offset.js';
import {
  IsSortColumn,
  IsSortOrder,
} from '../../shared/dto/sort-query.decorators.js';
import { sortKeys, type SortOrder } from '../../shared/utils/sort.js';

/** Columnas por las que el listado se puede ordenar (lista blanca). */
export const GEMBA_WALK_CALENDAR_SORT_COLUMNS = {
  id: 'id',
  manufacturingPlant: 'gembaWalkZone.manufacturingPlant.name',
  nameZone: 'gembaWalkZone.nameZone',
  nameLocation: 'gembaWalkZone.nameLocation',
  scheduledAt: 'scheduledAt',
  isAdditional: 'isAdditional',
  createdBy: 'createdBy.name',
  updatedBy: 'updatedBy.name',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  isActive: 'isActive',
} as const;
export type GembaWalkCalendarSortColumn =
  keyof typeof GEMBA_WALK_CALENDAR_SORT_COLUMNS;
export const GEMBA_WALK_CALENDAR_DEFAULT_SORT = {
  orderBy: 'scheduledAt',
  order: 'asc',
} as const;

export class QueryGembaWalkCalendarDto extends CatalogVisibilityDto {
  @IsOptional()
  @IsPositive()
  manufacturingPlantId?: number;

  @IsOptional()
  @IsPositive()
  gembaWalkZoneId?: number;

  // Rango [startDate, endDate) de instantes reales.
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(ISO_WITH_OFFSET, {
    message: 'La fecha debe incluir la zona horaria.',
  })
  startDate?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(ISO_WITH_OFFSET, {
    message: 'La fecha debe incluir la zona horaria.',
  })
  endDate?: string;

  @IsOptional()
  @IsBooleanString()
  readonly isAdditional?: string;

  @IsOptional()
  @IsPositive()
  readonly page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  readonly limit?: number;

  @IsSortColumn(sortKeys(GEMBA_WALK_CALENDAR_SORT_COLUMNS))
  orderBy?: GembaWalkCalendarSortColumn;

  @IsSortOrder()
  order?: SortOrder;
}
