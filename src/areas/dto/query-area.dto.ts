import { IsOptional, IsPositive, IsString, IsInt } from 'class-validator';

export class QueryAreaDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsPositive()
  manufacturingPlantId?: number;

  @IsOptional()
  @IsPositive()
  page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  limit?: number;
}
