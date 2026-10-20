import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
} from 'class-validator';

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

  @IsOptional()
  @IsPositive()
  processId: number;

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
