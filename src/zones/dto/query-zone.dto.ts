import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

import { parseStringArrayQueryByKey } from 'shared/utils';

export class QueryZoneDto {
  @IsOptional()
  @IsString()
  name: string;

  @IsOptional()
  @IsPositive()
  manufacturingPlantId: number;

  @IsOptional()
  @IsPositive()
  areaId?: number;

  @IsOptional()
  @Transform(parseStringArrayQueryByKey('manufacturingPlantNames'))
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  manufacturingPlantNames?: string[];

  @IsOptional()
  @IsBoolean()
  withArea: boolean = false;
}
