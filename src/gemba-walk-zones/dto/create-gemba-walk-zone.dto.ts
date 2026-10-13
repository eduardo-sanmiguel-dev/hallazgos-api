import { IsNotEmpty, IsPositive, IsString } from 'class-validator';

export class CreateGembaWalkZoneDto {
  @IsNotEmpty()
  @IsPositive()
  manufacturingPlantId: number;

  @IsNotEmpty()
  @IsString()
  nameZone: string;

  @IsNotEmpty()
  @IsString()
  nameLocation: string;
}
