import { IsOptional, IsString, IsInt, IsPositive } from 'class-validator';

export class QueryMainTypeDto {
  @IsOptional()
  @IsString()
  name: string;

  @IsOptional()
  @IsPositive()
  readonly page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  readonly limit?: number;
}
