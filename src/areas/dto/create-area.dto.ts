import { IsNotEmpty, IsPositive, IsString } from 'class-validator';

export class CreateAreaDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsPositive()
  manufacturingPlantId: number;
}
