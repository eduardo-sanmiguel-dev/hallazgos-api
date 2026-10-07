// Utilidades de zona horaria basadas solo en Intl (reglas IANA históricas del runtime).
// Nunca usan la TZ del proceso: todo se calcula con la zona IANA que se recibe.

export const DEFAULT_TIME_ZONE = 'America/Mexico_City';

export interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

const getFormatter = (timeZone: string) => {
  let formatter = formatters.get(timeZone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }

  return formatter;
};

export const isValidTimeZone = (timeZone?: string | null): boolean => {
  if (!timeZone) return false;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
};

export const resolveTimeZone = (timeZone?: string | null): string =>
  isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;

/** Hora de pared que muestra `timeZone` en el instante `instant`. */
export const toWallClock = (instant: Date, timeZone: string): WallClock => {
  const parts = getFormatter(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
};

const wallClockAsUtcMs = (wall: WallClock) =>
  Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );

/** Desfase (en minutos, ej. -300 para UTC-05) de `timeZone` en el instante `instant`. */
export const getOffsetMinutes = (instant: Date, timeZone: string): number => {
  const instantMs = Math.floor(instant.getTime() / 1000) * 1000;
  return Math.round(
    (wallClockAsUtcMs(toWallClock(instant, timeZone)) - instantMs) / 60000,
  );
};

/** Instante real que corresponde a la hora de pared `wall` en `timeZone`. */
export const wallClockToInstant = (wall: WallClock, timeZone: string): Date => {
  const guessMs = wallClockAsUtcMs(wall);
  const firstOffset = getOffsetMinutes(new Date(guessMs), timeZone);
  const candidateMs = guessMs - firstOffset * 60000;
  const secondOffset = getOffsetMinutes(new Date(candidateMs), timeZone);

  return new Date(
    secondOffset === firstOffset ? candidateMs : guessMs - secondOffset * 60000,
  );
};

/** Lee "YYYY-MM-DD HH:mm:ss[.ffffff]" (texto de timestamp without time zone). */
export const parseWallClock = (value: string): WallClock => {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(\.\d+)?$/.exec(
      value.trim(),
    );

  if (!match) {
    throw new Error(`Fecha sin zona con formato inesperado: "${value}"`);
  }

  const [, year, month, day, hour, minute, second] = match.map(Number);
  return { year, month, day, hour, minute, second };
};

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

export const formatWallClockDate = (wall: WallClock) =>
  `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}`;

export const formatWallClock = (wall: WallClock) =>
  `${formatWallClockDate(wall)} ${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}`;

/** "UTC-05" (o "UTC+0530" si el desfase tiene minutos), apto para nombres de archivo. */
export const formatUtcOffsetShort = (offsetMinutes: number) => {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const minutes = abs % 60;
  return `UTC${sign}${pad(Math.floor(abs / 60))}${minutes ? pad(minutes) : ''}`;
};

/** "UTC-06:00" */
export const formatUtcOffsetLong = (offsetMinutes: number) => {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
};

/** Número de serie de Excel (días desde 1899-12-30) para una hora de pared. */
export const wallClockToExcelSerial = (wall: WallClock) =>
  wallClockAsUtcMs(wall) / 86400000 + 25569;
