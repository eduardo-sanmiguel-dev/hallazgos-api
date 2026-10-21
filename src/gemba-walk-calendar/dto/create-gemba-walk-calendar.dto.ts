import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  Matches,
  ValidateNested,
} from 'class-validator';

import { ISO_WITH_OFFSET } from './iso-with-offset.js';

export class CreateGembaWalkCalendarEventDto {
  @IsNotEmpty()
  @IsPositive()
  gembaWalkZoneId: number;

  @IsNotEmpty()
  @IsISO8601({ strict: true })
  @Matches(ISO_WITH_OFFSET, {
    message: 'scheduledAt debe incluir zona horaria',
  })
  scheduledAt: string;

  @IsOptional()
  @IsBoolean()
  isAdditional?: boolean;
}

export class CreateGembaWalkCalendarDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateGembaWalkCalendarEventDto)
  events: CreateGembaWalkCalendarEventDto[];
}
