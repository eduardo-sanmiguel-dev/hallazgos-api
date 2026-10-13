import { IsISO8601, IsOptional, IsPositive, Matches } from 'class-validator';

import { ISO_WITH_OFFSET } from './iso-with-offset';

export class QueryGembaWalkCalendarDto {
  @IsOptional()
  @IsPositive()
  manufacturingPlantId?: number;

  @IsOptional()
  @IsPositive()
  gembaWalkZoneId?: number;

  // Rango [startDate, endDate) de instantes reales.
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(ISO_WITH_OFFSET, { message: 'startDate debe incluir zona horaria' })
  startDate?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(ISO_WITH_OFFSET, { message: 'endDate debe incluir zona horaria' })
  endDate?: string;
}
