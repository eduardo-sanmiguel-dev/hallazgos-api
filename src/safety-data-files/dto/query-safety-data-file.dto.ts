import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

import {
  IsSortColumn,
  IsSortOrder,
} from '../../shared/dto/sort-query.decorators.js';
import type { SortOrder } from '../../shared/utils/sort.js';

/** Solo se ordena por nombre (el listado no tiene otra columna). */
export const SAFETY_DATA_FILE_SORT_COLUMNS = ['name'] as const;

export class QuerySafetyDataFileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsSortColumn(SAFETY_DATA_FILE_SORT_COLUMNS)
  orderBy?: (typeof SAFETY_DATA_FILE_SORT_COLUMNS)[number];

  // Orden alfabético por nombre.
  @IsSortOrder()
  order?: SortOrder;

  @IsOptional()
  @IsPositive()
  page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  limit?: number;
}
