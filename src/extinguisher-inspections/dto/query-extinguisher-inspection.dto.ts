import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
} from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

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
}
