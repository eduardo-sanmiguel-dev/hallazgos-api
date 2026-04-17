import { IsOptional, IsPositive, IsString } from 'class-validator';

export class QueryAreaDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsPositive()
  manufacturingPlantId?: number;
}
