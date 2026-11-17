import { CatalogVisibilityDto } from '../../shared/dto/catalog-visibility.dto.js';
import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsPositive,
  IsString,
  IsInt,
} from 'class-validator';

import { parseStringArrayQueryByKey } from '../../shared/utils/index.js';
import {
  IsSortColumn,
  IsSortOrder,
} from '../../shared/dto/sort-query.decorators.js';
import { sortKeys, type SortOrder } from '../../shared/utils/sort.js';

/** Columnas por las que el listado se puede ordenar (lista blanca). */
export const PROCESS_SORT_COLUMNS = {
  id: 'id',
  name: 'name',
  manufacturingPlant: 'manufacturingPlant.name',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  isActive: 'isActive',
} as const;
export type ProcessSortColumn = keyof typeof PROCESS_SORT_COLUMNS;
export const PROCESS_DEFAULT_SORT = {
  orderBy: 'id',
  order: 'desc',
} as const;

export class QueryProcessesDto extends CatalogVisibilityDto {
  @IsOptional()
  @IsString()
  name: string;

  @IsOptional()
  @IsPositive()
  manufacturingPlantId: number;

  @IsOptional()
  @Transform(parseStringArrayQueryByKey('manufacturingPlantNames'))
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  manufacturingPlantNames: string[];

  @IsOptional()
  @IsPositive()
  page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  limit?: number;

  @IsSortColumn(sortKeys(PROCESS_SORT_COLUMNS))
  orderBy?: ProcessSortColumn;

  @IsSortOrder()
  order?: SortOrder;
}
