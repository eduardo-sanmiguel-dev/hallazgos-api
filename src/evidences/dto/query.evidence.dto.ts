import { IsOptional, IsPositive, IsString, Matches } from 'class-validator';

export class QueryEvidenceDto {
  @IsOptional()
  @IsPositive()
  manufacturingPlantId: number;

  @IsOptional()
  @IsPositive()
  mainTypeId: number;

  @IsOptional()
  @IsPositive()
  secondaryType: number;

  @IsOptional()
  @IsPositive()
  zone: number;

  @IsOptional()
  @IsString()
  status: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}\/\d{2}\/\d{4}$/)
  startDate: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}\/\d{2}\/\d{4}$/)
  endDate: string;
}
