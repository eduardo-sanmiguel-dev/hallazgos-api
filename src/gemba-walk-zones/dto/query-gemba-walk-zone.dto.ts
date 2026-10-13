import { IsOptional, IsPositive, IsString } from 'class-validator';

export class QueryGembaWalkZoneDto {
  @IsOptional()
  @IsString()
  nameZone?: string;

  @IsOptional()
  @IsString()
  nameLocation?: string;

  @IsOptional()
  @IsPositive()
  manufacturingPlantId?: number;
}
