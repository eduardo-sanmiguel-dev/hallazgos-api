import { IsOptional, IsPositive, IsString, Matches } from 'class-validator';
import {
  IsSortColumn,
  IsSortOrder,
} from '../../shared/dto/sort-query.decorators.js';
import { sortKeys, type SortOrder } from '../../shared/utils/sort.js';
import { IsPageLimit } from '../../shared/dto/pagination.decorators.js';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Columnas por las que el listado se puede ordenar (lista blanca). */
export const CIAEL_SORT_COLUMNS = {
  id: 'id',
  typeOfEvent: 'typeOfEvent.name',
  employee: 'employee.name',
  eventDate: 'eventDate',
  cieDiagnosis: 'cieDiagnosis.name',
  area: 'zone.area.name',
  zone: 'zone.name',
  createdAt: 'createdAt',
  createdBy: 'createdBy.name',
} as const;
export type CiaelSortColumn = keyof typeof CIAEL_SORT_COLUMNS;
export const CIAEL_DEFAULT_SORT = {
  orderBy: 'createdAt',
  order: 'desc',
} as const;

export class FiltersCiaelDto {
  @IsOptional()
  @IsPositive()
  manufacturingPlantId?: number;

  @IsOptional()
  @IsPositive()
  typeOfEventId?: number;

  @IsOptional()
  @IsPositive()
  zoneId?: number;

  // Nombre o número de colaborador (coincidencia parcial).
  @IsOptional()
  @IsString()
  employee?: string;

  // Rango inclusivo sobre eventDate (columna date, sin zona horaria).
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'Fecha no válida (formato AAAA-MM-DD).' })
  startDate?: string;

  @IsOptional()
  @Matches(DATE_ONLY, { message: 'Fecha no válida (formato AAAA-MM-DD).' })
  endDate?: string;

  @IsOptional()
  @IsPositive()
  page?: number;

  // De 1 a 100 (MAX_PAGE_LIMIT).
  @IsPageLimit()
  limit?: number;

  @IsSortColumn(sortKeys(CIAEL_SORT_COLUMNS))
  orderBy?: CiaelSortColumn;

  @IsSortOrder()
  order?: SortOrder;
}
