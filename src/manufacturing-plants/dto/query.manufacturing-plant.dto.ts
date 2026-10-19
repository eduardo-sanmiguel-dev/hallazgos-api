import { IsOptional, IsString, IsInt, IsPositive } from 'class-validator';

export class QueryManufacturingPlantDto {
  @IsOptional()
  @IsString()
  name: string;

  @IsOptional()
  @IsPositive()
  page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  limit?: number;
}
