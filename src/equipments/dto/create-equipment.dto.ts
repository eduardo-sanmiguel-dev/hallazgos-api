import { IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateEquipmentDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsPositive()
  deliveryFrequency?: number;

  @IsPositive()
  manufacturingPlantId: number;
}
