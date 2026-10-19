import {
  IsOptional,
  IsPositive,
  IsInt,
} from 'class-validator';

export class QueryConfigsTgDto {
  @IsOptional()
  @IsPositive()
  readonly positionId?: number;

  @IsOptional()
  @IsPositive()
  readonly manufacturingPlantId?: number;

  @IsOptional()
  @IsPositive()
  readonly areaManagerId?: number;

  @IsOptional()
  @IsPositive()
  readonly humanResourceManagerId?: number;

  @IsOptional()
  @IsPositive()
  readonly page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  readonly limit?: number;
}
