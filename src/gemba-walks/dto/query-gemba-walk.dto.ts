import {
  IsBooleanString,
  IsInt,
  IsISO8601,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
} from 'class-validator';

import { ISO_WITH_OFFSET } from '../../gemba-walk-calendar/dto/iso-with-offset.js';
import {
  IsSortColumn,
  IsSortOrder,
} from '../../shared/dto/sort-query.decorators.js';
import { sortKeys, type SortOrder } from '../../shared/utils/sort.js';

/** Columnas por las que el listado se puede ordenar (lista blanca). */
export const GEMBA_WALK_SORT_COLUMNS = {
  id: 'id',
  manufacturingPlant: 'gembaWalkCalendar.gembaWalkZone.manufacturingPlant.name',
  nameZone: 'gembaWalkCalendar.gembaWalkZone.nameZone',
  nameLocation: 'gembaWalkCalendar.gembaWalkZone.nameLocation',
  scheduledAt: 'gembaWalkCalendar.scheduledAt',
  isAdditional: 'gembaWalkCalendar.isAdditional',
  performedAt: 'performedAt',
  duration: 'durationSeconds',
  createdBy: 'createdBy.name',
} as const;
export type GembaWalkSortColumn = keyof typeof GEMBA_WALK_SORT_COLUMNS;
export const GEMBA_WALK_DEFAULT_SORT = {
  orderBy: 'performedAt',
  order: 'desc',
} as const;

export class QueryGembaWalkDto {
  @IsOptional()
  @IsPositive()
  manufacturingPlantId?: number;

  @IsOptional()
  @IsPositive()
  gembaWalkZoneId?: number;

  // Rango [startDate, endDate) sobre la fecha programada del evento.
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

  // Coincidencia exacta con el nombre de zona / ubicación.
  @IsOptional()
  @IsString()
  nameZone?: string;

  @IsOptional()
  @IsString()
  nameLocation?: string;

  @IsOptional()
  @IsBooleanString()
  isAdditional?: string;

  @IsOptional()
  @IsPositive()
  page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  limit?: number;

  @IsSortColumn(sortKeys(GEMBA_WALK_SORT_COLUMNS))
  orderBy?: GembaWalkSortColumn;

  @IsSortOrder()
  order?: SortOrder;
}

export class QueryAvailableEventsDto {
  @IsPositive()
  manufacturingPlantId: number;
}

// Calendario informativo: eventos de la planta en [startDate, endDate).
export class QueryWalkCalendarDto {
  @IsPositive()
  manufacturingPlantId: number;

  @IsISO8601({ strict: true })
  @Matches(ISO_WITH_OFFSET, {
    message: 'La fecha debe incluir la zona horaria.',
  })
  startDate: string;

  @IsISO8601({ strict: true })
  @Matches(ISO_WITH_OFFSET, {
    message: 'La fecha debe incluir la zona horaria.',
  })
  endDate: string;
}
