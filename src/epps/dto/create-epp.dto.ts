import {
  ArrayNotEmpty,
  IsArray,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class EquipmentDto {
  @IsPositive()
  quantity: number;

  @IsString()
  observations: string;

  @IsPositive()
  id: number;
}

export class CreateEppDto {
  @IsPositive()
  employeeId: number;

  @IsString()
  signature: string;

  // Antes se aceptaba una entrega sin equipos (quedaba vacía).
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => EquipmentDto)
  equipments: EquipmentDto[];
}
