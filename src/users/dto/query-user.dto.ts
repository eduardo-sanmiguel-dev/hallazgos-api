import { IsOptional, IsPositive, IsString } from 'class-validator';

export class QueryUserDto {
  @IsOptional()
  @IsString()
  name: string;

  @IsOptional()
  @IsPositive()
  manufacturingPlantId: number;

  @IsOptional()
  @IsString()
  rule: string;

  @IsOptional()
  @IsPositive()
  zoneId: number;

  @IsOptional()
  @IsString()
  orderBy: string;
}
