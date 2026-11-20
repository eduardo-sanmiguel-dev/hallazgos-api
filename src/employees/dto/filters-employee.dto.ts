import { CatalogVisibilityDto } from '../../shared/dto/catalog-visibility.dto.js';
import {
  IsBooleanString,
  IsIn,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import {
  IsSortColumn,
  IsSortOrder,
} from '../../shared/dto/sort-query.decorators.js';
import { sortKeys, type SortOrder } from '../../shared/utils/sort.js';
import { IsPageLimit } from '../../shared/dto/pagination.decorators.js';

/** Columnas por las que el listado se puede ordenar (lista blanca). */
export const EMPLOYEE_SORT_COLUMNS = {
  code: 'code',
  name: 'name',
  dateOfAdmission: 'dateOfAdmission',
  birthdate: 'birthdate',
  isActive: 'isActive',
  area: 'area.name',
  position: 'position.name',
  gender: 'gender.name',
} as const;
export type EmployeeSortColumn = keyof typeof EMPLOYEE_SORT_COLUMNS;
export const EMPLOYEE_DEFAULT_SORT = {
  orderBy: 'name',
  order: 'asc',
} as const;

export class FiltersEmployeeDto extends CatalogVisibilityDto {
  @IsOptional()
  @IsPositive()
  readonly manufacturingPlantId?: number;

  @IsOptional()
  @IsString()
  readonly name?: string;

  @IsOptional()
  @IsPositive()
  readonly positionId?: number;

  @IsOptional()
  @IsPositive()
  readonly areaId?: number;

  @IsOptional()
  @IsPositive()
  readonly genreId?: number;

  @IsOptional()
  @IsBooleanString()
  readonly isActive?: string;

  @IsOptional()
  @IsPositive()
  readonly page?: number;

  // De 1 a 100 (MAX_PAGE_LIMIT).
  @IsPageLimit()
  readonly limit?: number;

  // "options": solo id, código y nombre, sin relaciones. Para selectores
  // (EPP, ICS, CIAEL): con área, puesto, género y plantas eran ~800 KB.
  @IsOptional()
  @IsIn(['options'])
  readonly view?: 'options';

  @IsSortColumn(sortKeys(EMPLOYEE_SORT_COLUMNS))
  orderBy?: EmployeeSortColumn;

  @IsSortOrder()
  order?: SortOrder;
}
