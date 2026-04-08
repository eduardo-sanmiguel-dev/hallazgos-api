import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class QueryExtinguisherInspectionDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  manufacturingPlantId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  responsibleId?: number;
}
