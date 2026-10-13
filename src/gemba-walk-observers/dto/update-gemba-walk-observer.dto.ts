import { IsOptional, IsPositive } from 'class-validator';

export class UpdateGembaWalkObserverDto {
  @IsOptional()
  @IsPositive()
  manufacturingPlantId?: number;

  @IsOptional()
  @IsPositive()
  gembaWalkZoneId?: number;

  @IsOptional()
  @IsPositive()
  userId?: number;
}
