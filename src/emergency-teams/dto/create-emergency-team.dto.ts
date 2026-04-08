import {
  IsEnum,
  IsInt,
  IsNumber,
  IsPositive,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

import { ExtinguisherType } from 'emergency-teams/entities/emergency-team.entity';

export class CreateEmergencyTeamDto {
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

  @IsInt()
  @IsPositive()
  manufacturingPlantId: number;
}
