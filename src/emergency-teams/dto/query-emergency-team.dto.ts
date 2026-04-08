import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class QueryEmergencyTeamDto {
  @IsOptional()
  @IsString()
  search: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  manufacturingPlantId: number;
}
