import { IsIn, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class QuerySafetyDataFileDto {
  @IsOptional()
  @IsString()
  name?: string;

  // Orden alfabético por nombre.
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @IsOptional()
  @IsPositive()
  page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  limit?: number;
}
