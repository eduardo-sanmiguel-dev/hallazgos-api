import {
  ArrayNotEmpty,
  ArrayUnique,
  IsInt,
  IsNotEmpty,
  IsArray,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class EquipmentDto {
  @IsInt()
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
  @IsNotEmpty()
  signature: string;

  // Antes se aceptaba una entrega sin equipos (quedaba vacía).
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique((equipment: EquipmentDto) => equipment.id)
  @ValidateNested({ each: true })
  @Type(() => EquipmentDto)
  equipments: EquipmentDto[];
}
