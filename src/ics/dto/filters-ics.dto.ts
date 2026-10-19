import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

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
}
