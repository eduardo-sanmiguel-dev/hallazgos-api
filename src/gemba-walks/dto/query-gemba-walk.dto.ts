import {
  IsBooleanString,
  IsInt,
  IsISO8601,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
} from 'class-validator';

import { ISO_WITH_OFFSET } from 'gemba-walk-calendar/dto/iso-with-offset';

export class QueryGembaWalkDto {
  @IsOptional()
  @IsPositive()
  manufacturingPlantId?: number;

  @IsOptional()
  @IsPositive()
  gembaWalkZoneId?: number;

  // Rango [startDate, endDate) sobre la fecha programada del evento.
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(ISO_WITH_OFFSET, { message: 'startDate debe incluir zona horaria' })
  startDate?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(ISO_WITH_OFFSET, { message: 'endDate debe incluir zona horaria' })
  endDate?: string;

  // Coincidencia exacta con el nombre de zona / ubicación.
  @IsOptional()
  @IsString()
  nameZone?: string;

  @IsOptional()
  @IsString()
  nameLocation?: string;

  @IsOptional()
  @IsBooleanString()
  isAdditional?: string;

  @IsOptional()
  @IsPositive()
  page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  limit?: number;
}

export class QueryAvailableEventsDto {
  @IsPositive()
  manufacturingPlantId: number;
}

// Calendario informativo: eventos de la planta en [startDate, endDate).
export class QueryWalkCalendarDto {
  @IsPositive()
  manufacturingPlantId: number;

  @IsISO8601({ strict: true })
  @Matches(ISO_WITH_OFFSET, { message: 'startDate debe incluir zona horaria' })
  startDate: string;

  @IsISO8601({ strict: true })
  @Matches(ISO_WITH_OFFSET, { message: 'endDate debe incluir zona horaria' })
  endDate: string;
}
