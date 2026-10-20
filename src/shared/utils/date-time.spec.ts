import { durantionToTime, stringToDateWithTime } from './date-time';

describe('stringToDateWithTime', () => {
  it('conserva el formato español, omite segundos y no modifica la fecha', () => {
    const date = new Date(2026, 9, 20, 15, 30, 45);
    const instant = date.getTime();
    expect(stringToDateWithTime(date)).toBe('20 de octubre de 2026 15:30');
    expect(date.getTime()).toBe(instant);
  });

  it.each([
    ['2026-10-20', '20 de octubre de 2026 0:00'],
    ['2026-10', '1 de octubre de 2026 0:00'],
    ['2026', '1 de enero de 2026 0:00'],
    ['2026-01-02T03:04:59', '2 de enero de 2026 3:04'],
    ['2024-02-29T00:00:00', '29 de febrero de 2024 0:00'],
  ])('interpreta %s en hora local', (value, expected) => {
    expect(stringToDateWithTime(value)).toBe(expected);
  });

  it('respeta el desfase de las fechas con zona explícita', () => {
    const value = '2026-10-20T23:30:00-05:00';
    expect(stringToDateWithTime(value)).toBe(
      stringToDateWithTime(new Date(value)),
    );
  });

  it.each([
    '',
    'no-es-fecha',
    '2026-02-29',
    '2026-02-30T10:00:00',
    '2026-13-01',
    '2026-01-00',
  ])('conserva el mensaje para una fecha inválida: %s', (value) => {
    expect(stringToDateWithTime(value)).toBe('Fecha inválida');
  });

  it('admite objetos Date inválidos sin lanzar errores', () => {
    expect(stringToDateWithTime(new Date(NaN))).toBe('Fecha inválida');
  });
});

describe('durantionToTime', () => {
  it.each([
    [0, '  '],
    [1, '  1s'],
    [60, ' 1m '],
    [3600, '1h  '],
    [3661, '1h 1m 1s'],
    [86400, '  '],
    [90061, '1h 1m 1s'],
    [-3661, '-1h -1m -1s'],
    [-90061, '-1h -1m -1s'],
    [1.999, '  1s'],
    [-1.999, '  -1s'],
  ])(
    'conserva componentes y espacios para %s segundos',
    (seconds, expected) => {
      const start = new Date('2026-10-20T00:00:00Z');
      const end = new Date(start.getTime() + seconds * 1000);
      expect(durantionToTime(start, end)).toBe(expected);
    },
  );

  it('usa el tiempo transcurrido real entre fechas con distinto desfase', () => {
    expect(
      durantionToTime(
        new Date('2026-03-08T01:30:00-05:00'),
        new Date('2026-03-08T03:30:00-04:00'),
      ),
    ).toBe('1h  ');
  });

  it('no rompe los correos cuando una fecha es inválida', () => {
    expect(durantionToTime(new Date(NaN), new Date())).toBe('  ');
    expect(durantionToTime(new Date(), new Date(NaN))).toBe('  ');
  });
});
