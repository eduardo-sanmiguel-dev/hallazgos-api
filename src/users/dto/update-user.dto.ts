import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

import { parseStringArrayQueryByKey } from '../../shared/utils/index.js';
import { CreateUserDto } from './create-user.dto.js';

export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['manufacturingPlantNames', 'password'] as const),
) {
  // El formulario del UI manda `password: ""` al editar sin cambiarla: se
  // trata como "sin contraseña" y se conserva la actual.
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  password?: string;

  // Obligatorio también al editar: la edición reemplaza las plantas del
  // usuario y ningún rol puede operar sin al menos una.
  @Transform(parseStringArrayQueryByKey('manufacturingPlantNames'))
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  manufacturingPlantNames: string[];
}
