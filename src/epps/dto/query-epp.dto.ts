import {
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const EPP_SORTABLE_COLUMNS = [
  'name',
  'code',
  'position',
  'area',
] as const;
export type EppSortableColumn = (typeof EPP_SORTABLE_COLUMNS)[number];

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class QueryEppDto {
  @IsPositive()
  manufacturingPlantId: number;

  // Si no llega, el endpoint responde la lista completa (compatibilidad con
  // el front anterior durante el despliegue).
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(EPP_SORTABLE_COLUMNS)
  orderBy?: EppSortableColumn;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @IsOptional()
  @IsPositive()
  areaId?: number;

  @IsOptional()
  @IsPositive()
  positionId?: number;

  // Colaboradores con al menos una entrega activa de este equipo.
  @IsOptional()
  @IsPositive()
  equipmentId?: number;

  // Rango inclusivo sobre deliveryDate de las entregas activas (columna date).
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'startDate debe tener formato YYYY-MM-DD' })
  startDate?: string;

  @IsOptional()
  @Matches(DATE_ONLY, { message: 'endDate debe tener formato YYYY-MM-DD' })
  endDate?: string;

  // "false": la página sin historial (firmas incluidas pesan); el UI lo pide
  // por colaborador al expandir la fila (GET /epps/employees/:id/history).
  // Sin el parámetro se incluye, como antes (compatibilidad al desplegar).
  @IsOptional()
  @IsIn(['true', 'false'])
  withHistory?: 'true' | 'false';
}
