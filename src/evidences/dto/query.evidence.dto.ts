import {
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class QueryEvidenceDto {
  @IsOptional()
  @IsPositive()
  id: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(,\d+)*$/)
  ids: string;

  @IsOptional()
  @IsPositive()
  manufacturingPlantId: number;

  @IsOptional()
  @IsPositive()
  mainTypeId: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(,\d+)*$/)
  mainTypeIds: string;

  @IsOptional()
  @IsPositive()
  secondaryType: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(,\d+)*$/)
  secondaryTypeIds: string;

  @IsOptional()
  @IsPositive()
  zone: number;

  @IsOptional()
  @IsPositive()
  area: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(,\d+)*$/)
  areaIds: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(,\d+)*$/)
  zoneIds: string;

  @IsOptional()
  @IsPositive()
  process: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(,\d+)*$/)
  processIds: string;

  @IsOptional()
  @IsPositive()
  responsible: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(,\d+)*$/)
  responsibleIds: string;

  @IsOptional()
  @IsString()
  status: string;

  @IsOptional()
  @IsString()
  statuses: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}\/\d{2}\/\d{4}$/)
  startDate: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}\/\d{2}\/\d{4}$/)
  endDate: string;

  // Zona IANA del navegador (ej. America/Bogota). Solo afecta el formato del
  // Excel; si no llega o no es válida se usa America/Mexico_City.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone: string;
}
