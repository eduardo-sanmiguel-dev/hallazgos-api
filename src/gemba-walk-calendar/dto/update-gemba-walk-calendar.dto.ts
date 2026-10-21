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

export class UpdateGembaWalkCalendarEventDto {
  @IsNotEmpty()
  @IsPositive()
  id: number;

  @IsOptional()
  @IsPositive()
  gembaWalkZoneId?: number;

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(ISO_WITH_OFFSET, {
    message: 'scheduledAt debe incluir zona horaria',
  })
  scheduledAt?: string;

  @IsOptional()
  @IsBoolean()
  isAdditional?: boolean;
}

export class UpdateGembaWalkCalendarDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => UpdateGembaWalkCalendarEventDto)
  events: UpdateGembaWalkCalendarEventDto[];
}
