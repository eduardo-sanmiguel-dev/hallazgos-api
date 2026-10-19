import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class QueryUserDto {
  @IsOptional()
  @IsString()
  name: string;

  // Nombre o correo electrónico (coincidencia parcial).
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsPositive()
  manufacturingPlantId: number;

  @IsOptional()
  @IsString()
  rule: string;

  @IsOptional()
  @IsPositive()
  zoneId: number;

  @IsOptional()
  @IsPositive()
  processId: number;

  @IsOptional()
  @IsString()
  orderBy: string;

  @IsOptional()
  @IsPositive()
  page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  limit?: number;
}
