import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export class CreateAreaDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsPositive()
  manufacturingPlantId: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  coordinateX?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  coordinateY?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  zoomLevel?: number;
}
