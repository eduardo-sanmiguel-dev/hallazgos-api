import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsPositive,
  IsString,
  IsInt,
} from 'class-validator';

import { parseStringArrayQueryByKey } from 'shared/utils';

export class QueryProcessesDto {
  @IsOptional()
  @IsString()
  name: string;

  @IsOptional()
  @IsPositive()
  manufacturingPlantId: number;

  @IsOptional()
  @Transform(parseStringArrayQueryByKey('manufacturingPlantNames'))
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  manufacturingPlantNames: string[];

  @IsOptional()
  @IsPositive()
  page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  limit?: number;
}
