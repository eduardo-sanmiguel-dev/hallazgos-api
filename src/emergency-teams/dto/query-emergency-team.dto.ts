import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

import { ExtinguisherType } from '../entities/emergency-team.entity.js';

export class QueryEmergencyTeamDto {
  @IsOptional()
  @IsString()
  search: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  manufacturingPlantId: number;

  @IsOptional()
  @IsEnum(ExtinguisherType)
  typeOfExtinguisher?: ExtinguisherType;

  @IsOptional()
  @IsPositive()
  page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  limit?: number;
}
