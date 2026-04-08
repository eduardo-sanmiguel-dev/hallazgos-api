import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { ExtinguisherType } from 'emergency-teams/entities/emergency-team.entity';
import { EvaluationValues } from '../entities/extinguisher-inspection-evaluation.entity';

class CreateExtinguisherInspectionEvaluationDto {
  @IsString()
  @Length(5, 150)
  location: string;

  @IsInt()
  @IsPositive()
  extinguisherNumber: number;

  @IsEnum(ExtinguisherType)
  typeOfExtinguisher: ExtinguisherType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(9999999999.99)
  capacity: number;

  @IsEnum(EvaluationValues)
  pressureManometer: EvaluationValues;

  @IsEnum(EvaluationValues)
  valve: EvaluationValues;

  @IsEnum(EvaluationValues)
  hose: EvaluationValues;

  @IsEnum(EvaluationValues)
  cylinder: EvaluationValues;

  @IsEnum(EvaluationValues)
  barrette: EvaluationValues;

  @IsEnum(EvaluationValues)
  seal: EvaluationValues;

  @IsEnum(EvaluationValues)
  cornet: EvaluationValues;

  @IsEnum(EvaluationValues)
  access: EvaluationValues;

  @IsEnum(EvaluationValues)
  support: EvaluationValues;

  @IsOptional()
  @IsEnum(EvaluationValues)
  signaling: EvaluationValues;

  @IsDateString()
  nextRechargeDate: string;

  @IsDateString()
  maintenanceDate: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  observations?: string;
}

export class CreateExtinguisherInspectionDto {
  @IsDateString()
  inspectionDate: string;

  @IsInt()
  @IsPositive()
  manufacturingPlantId: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateExtinguisherInspectionEvaluationDto)
  evaluations?: CreateExtinguisherInspectionEvaluationDto[];
}
