import { parseStringArrayQueryByKey } from '../../shared/utils/index.js';
import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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

  @IsNotEmpty()
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

  @IsOptional()
  @Transform(parseStringArrayQueryByKey('zoneNames'))
  @IsArray()
  @IsString({ each: true })
  zoneNames: string[];

  @IsOptional()
  @Transform(parseStringArrayQueryByKey('processNames'))
  @IsArray()
  @IsString({ each: true })
  processNames: string[];

  // Recibe los avisos a toda la planta. Opcional: sin ella, true al crear y
  // sin cambios al editar.
  @IsOptional()
  @IsBoolean()
  plantNotifications?: boolean;
}
