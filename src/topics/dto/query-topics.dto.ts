import {
  IsOptional,
  IsPositive,
  IsString,
  IsInt,
  IsIn,
} from 'class-validator';

export class QueryTopicDto {
  @IsOptional()
  @IsString()
  readonly name?: string;

  @IsOptional()
  @IsPositive()
  readonly manufacturingPlantId?: number;

  @IsOptional()
  @IsIn(['NUMERIC', 'BOOLEAN'])
  readonly typeOfEvaluation?: string;

  @IsOptional()
  @IsPositive()
  readonly page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  readonly limit?: number;
}
