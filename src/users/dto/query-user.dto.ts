import { CatalogVisibilityDto } from '../../shared/dto/catalog-visibility.dto.js';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
} from 'class-validator';

import { parseStringArrayQueryByKey } from '../../shared/utils/index.js';
import { IsSortOrder } from '../../shared/dto/sort-query.decorators.js';
import { sortKeys, type SortOrder } from '../../shared/utils/sort.js';

// Columnas por las que se puede ordenar el listado de usuarios (lista blanca).
export const USER_SORT_COLUMNS = {
  id: 'id',
  name: 'name',
  email: 'email',
  role: 'role',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  isActive: 'isActive',
} as const;
export const USER_SORTABLE_COLUMNS = sortKeys(USER_SORT_COLUMNS);
export type UserSortableColumn = keyof typeof USER_SORT_COLUMNS;
export const USER_DEFAULT_SORT = { orderBy: 'id', order: 'desc' } as const;

// `campo` (con la dirección en `order`) o `campo|asc` / `campo|desc`, el
// formato de los selectores (dirección sin importar mayúsculas).
export const USER_ORDER_BY_PATTERN = new RegExp(
  `^(${USER_SORTABLE_COLUMNS.join('|')})([|](asc|desc))?$`,
  'i',
);

export class QueryUserDto extends CatalogVisibilityDto {
  @IsOptional()
  @IsString()
  name: string;

  // Nombre o correo electrónico (coincidencia parcial).
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsPositive()
  manufacturingPlantId: number;

  @IsOptional()
  @IsString()
  rule: string;

  @IsOptional()
  @IsPositive()
  zoneId: number;

  // Usuarios con alguna de estas zonas (p. ej. responsables en los filtros
  // de hallazgos). A diferencia de zoneId, no limita el rol.
  @IsOptional()
  @Transform(parseStringArrayQueryByKey('zoneIds'))
  @IsArray()
  @IsNumberString({ no_symbols: true }, { each: true })
  zoneIds?: string[];

  @IsOptional()
  @IsPositive()
  processId: number;

  // "options": solo id, nombre, correo y rol, sin plantas, zonas ni procesos.
  // Para selectores: con las relaciones la respuesta pesa megabytes.
  @IsOptional()
  @IsIn(['options'])
  view?: 'options';

  @IsOptional()
  @IsString()
  @Matches(USER_ORDER_BY_PATTERN, {
    message: `Debe ser un campo, o campo|asc o campo|desc, con campo en: ${USER_SORTABLE_COLUMNS.join(', ')}`,
  })
  orderBy: string;

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
