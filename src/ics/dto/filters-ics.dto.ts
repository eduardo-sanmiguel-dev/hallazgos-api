import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import {
  IsSortColumn,
  IsSortOrder,
} from '../../shared/dto/sort-query.decorators.js';
import { sortKeys, type SortOrder } from '../../shared/utils/sort.js';

/** Columnas por las que el listado se puede ordenar (lista blanca). */
export const ICS_SORT_COLUMNS = {
  id: 'id',
  manufacturingPlant: 'manufacturingPlant.name',
  ruleOfLife: 'ruleOfLife.name',
  standardOfBehavior: 'standardOfBehavior.name',
  areaOfBehavior: 'areaOfBehavior.name',
  totalPeople: 'totalPeople',
  totalCorrectPeople: 'totalCorrectPeople',
  totalIncorrectPeople: 'totalIncorrectPeople',
  icsPercentage: 'icsPercentage',
  createdAt: 'createdAt',
} as const;
export type IcsSortColumn = keyof typeof ICS_SORT_COLUMNS;
export const ICS_DEFAULT_SORT = {
  orderBy: 'createdAt',
  order: 'desc',
} as const;

export class FiltersIcsDto {
  @IsOptional()
  @IsPositive()
  readonly manufacturingPlantId?: number;

  @IsOptional()
  @IsPositive()
  readonly areaOfBehaviorId?: number;

  // Busca por regla de vida o estándar de comportamiento.
  @IsOptional()
  @IsString()
  readonly name?: string;

  @IsOptional()
  @IsPositive()
  readonly page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  readonly limit?: number;

  @IsSortColumn(sortKeys(ICS_SORT_COLUMNS))
  orderBy?: IcsSortColumn;

  @IsSortOrder()
  order?: SortOrder;
}
