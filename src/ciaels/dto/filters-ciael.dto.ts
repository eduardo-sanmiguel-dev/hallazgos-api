import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
} from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class FiltersCiaelDto {
  @IsOptional()
  @IsPositive()
  manufacturingPlantId?: number;

  @IsOptional()
  @IsPositive()
  typeOfEventId?: number;

  @IsOptional()
  @IsPositive()
  zoneId?: number;

  // Nombre o número de colaborador (coincidencia parcial).
  @IsOptional()
  @IsString()
  employee?: string;

  // Rango inclusivo sobre eventDate (columna date, sin zona horaria).
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'startDate debe tener formato YYYY-MM-DD' })
  startDate?: string;

  @IsOptional()
  @Matches(DATE_ONLY, { message: 'endDate debe tener formato YYYY-MM-DD' })
  endDate?: string;

  @IsOptional()
  @IsPositive()
  page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  limit?: number;
}
