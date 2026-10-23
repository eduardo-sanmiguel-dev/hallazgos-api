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

// Columnas por las que se puede ordenar el listado de usuarios.
export const USER_SORTABLE_COLUMNS = [
  'id',
  'name',
  'email',
  'role',
  'createdAt',
  'updatedAt',
] as const;
export type UserSortableColumn = (typeof USER_SORTABLE_COLUMNS)[number];

// Formato `campo|asc` o `campo|desc` (dirección sin importar mayúsculas).
export const USER_ORDER_BY_PATTERN = new RegExp(
  `^(${USER_SORTABLE_COLUMNS.join('|')})[|](asc|desc)$`,
  'i',
);

export class QueryUserDto {
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
    message: `orderBy debe tener el formato campo|asc o campo|desc, con campo en: ${USER_SORTABLE_COLUMNS.join(', ')}`,
  })
  orderBy: string;

  @IsOptional()
  @IsPositive()
  page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  limit?: number;
}
