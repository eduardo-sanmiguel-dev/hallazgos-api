import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class FiltersEmployeeDto {
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

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  readonly limit?: number;

  // "options": solo id, código y nombre, sin relaciones. Para selectores
  // (EPP, ICS, CIAEL): con área, puesto, género y plantas eran ~800 KB.
  @IsOptional()
  @IsIn(['options'])
  readonly view?: 'options';
}
