import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsNumber,
  IsPositive,
  IsString,
} from 'class-validator';

export class CreateEmployeeDto {
  @IsNumber()
  code: number;

  @IsString()
  name: string;

  @Type(() => Date)
  @IsDate()
  birthdate: Date;

  @Type(() => Date)
  @IsDate()
  dateOfAdmission: Date;

  @IsPositive()
  areaId: number;

  @IsPositive()
  positionId: number;

  @IsPositive()
  genderId: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsPositive({ each: true })
  @Type(() => Number)
  manufacturingPlantsIds: number[];
}
