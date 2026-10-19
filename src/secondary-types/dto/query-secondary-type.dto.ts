import { IsOptional, IsPositive, IsString, IsInt } from 'class-validator';

export class QuerySecondaryTypeDto {
  @IsOptional()
  @IsString()
  name: string;

  @IsOptional()
  @IsPositive()
  mainTypeId: number;

  @IsOptional()
  @IsPositive()
  readonly page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  readonly limit?: number;
}
