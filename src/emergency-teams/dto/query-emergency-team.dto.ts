import { CatalogVisibilityDto } from '../../shared/dto/catalog-visibility.dto.js';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

import { ExtinguisherType } from '../entities/emergency-team.entity.js';
import {
  IsSortColumn,
  IsSortOrder,
} from '../../shared/dto/sort-query.decorators.js';
import { sortKeys, type SortOrder } from '../../shared/utils/sort.js';
import { IsPageLimit } from '../../shared/dto/pagination.decorators.js';

/** Columnas por las que el listado se puede ordenar (lista blanca). */
export const EMERGENCY_TEAM_SORT_COLUMNS = {
  id: 'emergencyTeam.id',
  manufacturingPlant: 'manufacturingPlant.name',
  extinguisherNumber: 'emergencyTeam.extinguisherNumber',
  location: 'emergencyTeam.location',
  typeOfExtinguisher: 'emergencyTeam.typeOfExtinguisher',
  capacity: 'emergencyTeam.capacity',
  createdAt: 'emergencyTeam.createdAt',
  createdBy: 'createdBy.name',
  updatedAt: 'emergencyTeam.updatedAt',
  updatedBy: 'updatedBy.name',
  isActive: 'emergencyTeam.isActive',
} as const;
export type EmergencyTeamSortColumn = keyof typeof EMERGENCY_TEAM_SORT_COLUMNS;
export const EMERGENCY_TEAM_DEFAULT_SORT = {
  orderBy: 'id',
  order: 'desc',
} as const;

export class QueryEmergencyTeamDto extends CatalogVisibilityDto {
  @IsOptional()
  @IsString()
  search: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  manufacturingPlantId: number;

  @IsOptional()
  @IsEnum(ExtinguisherType)
  typeOfExtinguisher?: ExtinguisherType;

  @IsOptional()
  @IsPositive()
  page?: number;

  // De 1 a 100 (MAX_PAGE_LIMIT).
  @IsPageLimit()
  limit?: number;

  @IsSortColumn(sortKeys(EMERGENCY_TEAM_SORT_COLUMNS))
  orderBy?: EmergencyTeamSortColumn;

  @IsSortOrder()
  order?: SortOrder;
}
