import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreateGembaWalkResultDto {
  @IsNotEmpty()
  @IsPositive()
  gembaWalkEvaluationId: number;

  @IsBoolean()
  isCompliant: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comments?: string;
}

export class StartGembaWalkDto {
  @IsNotEmpty()
  @IsPositive()
  gembaWalkCalendarId: number;
}

export class CreateGembaWalkDto {
  @IsNotEmpty()
  @IsPositive()
  gembaWalkCalendarId: number;

  // Comprobante devuelto por POST /gemba-walk/walks/start.
  @IsNotEmpty()
  @IsString()
  startToken: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateGembaWalkResultDto)
  results: CreateGembaWalkResultDto[];
}
