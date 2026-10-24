import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsPositive,
  IsString,
  IsInt,
} from 'class-validator';

import { parseStringArrayQueryByKey } from '../../shared/utils/index.js';

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

  // Se lee el valor crudo: la conversión implícita hacía "false" → true.
  @IsOptional()
  @Transform(({ obj, key }) => obj[key] === true || obj[key] === 'true')
  @IsBoolean()
  withArea: boolean = false;

  @IsOptional()
  @IsPositive()
  page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  limit?: number;

  // "options": id y nombre, con id y nombre de su planta y área. Para
  // selectores y filtros: con quién la creó/editó y la planta completa
  // eran ~220 KB.
  @IsOptional()
  @IsIn(['options'])
  view?: 'options';
}
