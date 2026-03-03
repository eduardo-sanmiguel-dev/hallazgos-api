import { parseStringArrayQueryByKey } from '@shared/utils';
import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  email: string;

  @IsOptional()
  @IsString()
  password: string;

  @IsNotEmpty()
  @IsString()
  rule: string;

  @IsNotEmpty()
  @Transform(parseStringArrayQueryByKey('manufacturingPlantNames'))
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  manufacturingPlantNames: string[];

  @IsNotEmpty()
  @Transform(parseStringArrayQueryByKey('zoneNames'))
  @IsArray()
  @IsString({ each: true })
  zoneNames: string[];

  @IsOptional()
  @Transform(parseStringArrayQueryByKey('processNames'))
  @IsArray()
  @IsString({ each: true })
  processNames: string[];
}
