import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  IsSortColumn,
  IsSortOrder,
} from '../../shared/dto/sort-query.decorators.js';
import { sortKeys, type SortOrder } from '../../shared/utils/sort.js';

/** Columnas por las que el listado se puede ordenar (lista blanca). */
export const EVIDENCE_SORT_COLUMNS = {
  id: 'id',
  manufacturingPlant: 'manufacturingPlant.name',
  mainType: 'mainType.name',
  secondaryType: 'secondaryType.name',
  area: 'zone.area.name',
  zone: 'zone.name',
  process: 'process.name',
  user: 'user.name',
  status: 'status',
  priority: 'priorityDays',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  solutionDate: 'solutionDate',
} as const;
export type EvidenceSortColumn = keyof typeof EVIDENCE_SORT_COLUMNS;
export const EVIDENCE_DEFAULT_SORT = {
  orderBy: 'id',
  order: 'desc',
} as const;

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

  // Listado paginado (lista de hallazgos). Sin ellos, todos (descargas).
  @IsOptional()
  @IsPositive()
  page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  limit?: number;

  // Zona IANA del navegador (ej. America/Bogota). Solo afecta el formato del
  // Excel; si no llega o no es válida se usa America/Mexico_City.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone: string;

  @IsSortColumn(sortKeys(EVIDENCE_SORT_COLUMNS))
  orderBy?: EvidenceSortColumn;

  @IsSortOrder()
  order?: SortOrder;
}
