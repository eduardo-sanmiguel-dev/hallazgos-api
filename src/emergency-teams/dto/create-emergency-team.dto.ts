import {
  IsEnum,
  IsInt,
  IsNumber,
  IsPositive,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

import { ExtinguisherType } from 'emergency-teams/entities/emergency-team.entity';

export class CreateEmergencyTeamDto {
  @IsString()
  @Length(5, 150)
  location: string;

  @IsString()
  @Length(1, 50)
  @Matches(/^[a-zA-Z0-9]+$/, {
    message: 'extinguisherNumber must be alphanumeric',
  })
  extinguisherNumber: string;

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
