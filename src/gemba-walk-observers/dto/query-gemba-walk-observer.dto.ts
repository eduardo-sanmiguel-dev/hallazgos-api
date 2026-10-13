import { IsOptional, IsPositive, IsString } from 'class-validator';

export class QueryGembaWalkObserverDto {
  @IsOptional()
  @IsPositive()
  manufacturingPlantId?: number;

  @IsOptional()
  @IsPositive()
  gembaWalkZoneId?: number;

  @IsOptional()
  @IsString()
  userName?: string;
}
