import {
  formatUtcOffsetLong,
  formatUtcOffsetShort,
  formatWallClock,
  getOffsetMinutes,
  parseWallClock,
  resolveTimeZone,
  toWallClock,
  wallClockToExcelSerial,
  wallClockToInstant,
} from '../shared/utils/timezone';
import {
  getStorageTimeZone,
  storedWallClockToInstant,
} from './evidence-storage-timezones';

const MEXICO = 'America/Mexico_City';
const BOGOTA = 'America/Bogota';

describe('timezone utils (reglas IANA históricas)', () => {
  it('México en julio de 2022 todavía tenía horario de verano (UTC-05)', () => {
    const instant = wallClockToInstant(
      parseWallClock('2022-07-15 10:00:00'),
      MEXICO,
    );
    expect(instant.toISOString()).toBe('2022-07-15T15:00:00.000Z');
    expect(getOffsetMinutes(instant, MEXICO)).toBe(-300);
  });

  it('México en enero de 2022 estaba en UTC-06', () => {
    const instant = wallClockToInstant(
      parseWallClock('2022-01-15 10:00:00'),
      MEXICO,
    );
    expect(instant.toISOString()).toBe('2022-01-15T16:00:00.000Z');
  });

  it('México en julio de 2026 ya no tiene horario de verano (UTC-06)', () => {
    const instant = wallClockToInstant(
      parseWallClock('2026-07-15 10:00:00'),
      MEXICO,
    );
    expect(instant.toISOString()).toBe('2026-07-15T16:00:00.000Z');
  });

  it('Bogotá está en UTC-05 todo el año', () => {
    const instant = new Date('2026-10-07T19:19:05Z');
    expect(getOffsetMinutes(instant, BOGOTA)).toBe(-300);
    expect(formatWallClock(toWallClock(instant, BOGOTA))).toBe(
      '2026-10-07 14:19:05',
    );
    expect(formatWallClock(toWallClock(instant, MEXICO))).toBe(
      '2026-10-07 13:19:05',
    );
  });

  it('formatea desfases', () => {
    expect(formatUtcOffsetShort(-300)).toBe('UTC-05');
    expect(formatUtcOffsetShort(-360)).toBe('UTC-06');
    expect(formatUtcOffsetShort(0)).toBe('UTC+00');
    expect(formatUtcOffsetShort(330)).toBe('UTC+0530');
    expect(formatUtcOffsetLong(-360)).toBe('UTC-06:00');
  });

  it('usa America/Mexico_City si la zona no llega o no es válida', () => {
    expect(resolveTimeZone(undefined)).toBe(MEXICO);
    expect(resolveTimeZone('No/Existe')).toBe(MEXICO);
    expect(resolveTimeZone(BOGOTA)).toBe(BOGOTA);
  });

  it('calcula el número de serie de Excel', () => {
    expect(wallClockToExcelSerial(parseWallClock('1900-03-01 00:00:00'))).toBe(
      61,
    );
    expect(wallClockToExcelSerial(parseWallClock('2026-10-07 12:00:00'))).toBe(
      46302.5,
    );
  });
});

describe('zona de almacenamiento de evidence', () => {
  it.each([
    // [columna, país, guardado, zona esperada]
    ['createdAt', 'CO', '2025-09-10 21:15:00.123', 'UTC'],
    ['createdAt', 'MX', '2025-09-10 21:15:00.123', 'UTC'],
    ['createdAt', 'CO', '2026-02-18 10:29:38', BOGOTA],
    ['createdAt', 'MX', '2026-02-11 00:42:29.86', 'UTC'],
    ['createdAt', 'MX', '2026-02-25 18:32:42.442', MEXICO], // id 2879
    ['createdAt', 'MX', '2026-09-30 15:36:33.108', MEXICO],
    ['createdAt', 'CO', '2026-10-07 11:55:31', BOGOTA],
    ['solutionDate', 'CO', '2026-02-23 19:45:18.608', 'UTC'],
    ['solutionDate', 'CO', '2026-02-26 06:34:57.08', MEXICO],
    ['solutionDate', 'MX', '2026-02-26 08:36:09.966', MEXICO],
    ['solutionDate', 'CO', '2026-04-01 09:01:05.231', MEXICO],
    ['solutionDate', 'CO', '2026-04-07 07:56:26', BOGOTA],
    ['solutionDate', 'MX', '2026-10-07 10:10:08.064', MEXICO],
  ] as const)('%s %s %s → %s', (column, country, stored, zone) => {
    expect(getStorageTimeZone(column, country, stored)).toBe(zone);
  });

  it.each(['updatedAt', 'startProcessDate'])(
    'falla explícitamente para %s (sin regla)',
    (column) => {
      expect(() =>
        getStorageTimeZone(column, 'MX', '2026-10-07 10:00:00'),
      ).toThrow(/No hay regla de zona/);
    },
  );

  it('convierte el valor guardado al instante real', () => {
    // Colombia antes de feb-2026: guardado en UTC
    expect(
      storedWallClockToInstant(
        'createdAt',
        'CO',
        '2025-09-10 21:15:00.123',
      ).toISOString(),
    ).toBe('2025-09-10T21:15:00.000Z');
    // Colombia hoy: hora de pared de Bogotá
    expect(
      storedWallClockToInstant(
        'createdAt',
        'CO',
        '2026-10-07 11:55:31',
      ).toISOString(),
    ).toBe('2026-10-07T16:55:31.000Z');
    // México hoy: hora de pared de México
    expect(
      storedWallClockToInstant(
        'createdAt',
        'MX',
        '2026-09-30 15:36:33.108',
      ).toISOString(),
    ).toBe('2026-09-30T21:36:33.000Z');
  });
});
