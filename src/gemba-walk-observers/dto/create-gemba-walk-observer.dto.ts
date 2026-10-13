import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsPositive,
} from 'class-validator';

export class CreateGembaWalkObserverDto {
  @IsNotEmpty()
  @IsPositive()
  manufacturingPlantId: number;

  @IsNotEmpty()
  @IsPositive()
  gembaWalkZoneId: number;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsPositive({ each: true })
  userIds: number[];
}
