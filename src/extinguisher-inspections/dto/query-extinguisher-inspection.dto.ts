import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
} from 'class-validator';
import {
  IsSortColumn,
  IsSortOrder,
} from '../../shared/dto/sort-query.decorators.js';
import { sortKeys, type SortOrder } from '../../shared/utils/sort.js';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Columnas por las que el listado se puede ordenar (lista blanca). */
export const EXTINGUISHER_INSPECTION_SORT_COLUMNS = {
  id: 'extinguisherInspection.id',
  manufacturingPlant: 'manufacturingPlant.name',
  responsible: 'responsible.name',
  inspectionDate: 'extinguisherInspection.inspectionDate',
  createdAt: 'extinguisherInspection.createdAt',
  createdBy: 'createdBy.name',
} as const;
export type ExtinguisherInspectionSortColumn =
  keyof typeof EXTINGUISHER_INSPECTION_SORT_COLUMNS;
export const EXTINGUISHER_INSPECTION_DEFAULT_SORT = {
  orderBy: 'id',
  order: 'desc',
} as const;

export class QueryExtinguisherInspectionDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  manufacturingPlantId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  responsibleId?: number;

  // Rango inclusivo sobre inspectionDate (columna date, sin zona horaria).
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'Fecha no válida (formato AAAA-MM-DD).' })
  startDate?: string;

  @IsOptional()
  @Matches(DATE_ONLY, { message: 'Fecha no válida (formato AAAA-MM-DD).' })
  endDate?: string;

  @IsOptional()
  @IsPositive()
  page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  limit?: number;

  @IsSortColumn(sortKeys(EXTINGUISHER_INSPECTION_SORT_COLUMNS))
  orderBy?: ExtinguisherInspectionSortColumn;

  @IsSortOrder()
  order?: SortOrder;
}
