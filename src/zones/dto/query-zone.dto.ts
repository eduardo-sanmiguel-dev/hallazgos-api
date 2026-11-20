import { CatalogVisibilityDto } from '../../shared/dto/catalog-visibility.dto.js';
import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

import { parseStringArrayQueryByKey } from '../../shared/utils/index.js';
import {
  IsSortColumn,
  IsSortOrder,
} from '../../shared/dto/sort-query.decorators.js';
import { sortKeys, type SortOrder } from '../../shared/utils/sort.js';
import { IsPageLimit } from '../../shared/dto/pagination.decorators.js';

/** Columnas por las que el listado se puede ordenar (lista blanca). */
export const ZONE_SORT_COLUMNS = {
  id: 'id',
  name: 'name',
  manufacturingPlant: 'manufacturingPlant.name',
  area: 'area.name',
  createdBy: 'createdBy.name',
  updatedBy: 'updatedBy.name',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  isActive: 'isActive',
} as const;
export type ZoneSortColumn = keyof typeof ZONE_SORT_COLUMNS;
export const ZONE_DEFAULT_SORT = {
  orderBy: 'id',
  order: 'desc',
} as const;

export class QueryZoneDto extends CatalogVisibilityDto {
  @IsOptional()
  @IsString()
  name: string;

  @IsOptional()
  @IsPositive()
  manufacturingPlantId: number;

  @IsOptional()
  @IsPositive()
  areaId?: number;

  @IsOptional()
  @Transform(parseStringArrayQueryByKey('manufacturingPlantNames'))
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  manufacturingPlantNames?: string[];

  // Se lee el valor crudo: la conversión implícita hacía "false" → true.
  @IsOptional()
  @Transform(({ obj, key }) => obj[key] === true || obj[key] === 'true')
  @IsBoolean()
  withArea: boolean = false;

  @IsOptional()
  @IsPositive()
  page?: number;

  // De 1 a 100; -1 = todos (catálogo chico).
  @IsPageLimit({ allowAll: true })
  limit?: number;

  // "options": id y nombre, con id y nombre de su planta y área. Para
  // selectores y filtros: con quién la creó/editó y la planta completa
  // eran ~220 KB.
  @IsOptional()
  @IsIn(['options'])
  view?: 'options';

  @IsSortColumn(sortKeys(ZONE_SORT_COLUMNS))
  orderBy?: ZoneSortColumn;

  @IsSortOrder()
  order?: SortOrder;
}
