import {
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
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
}
