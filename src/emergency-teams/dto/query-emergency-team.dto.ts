import { IsOptional, IsString } from 'class-validator';

export class QueryEmergencyTeamDto {
  @IsOptional()
  @IsString()
  search: string;
}
