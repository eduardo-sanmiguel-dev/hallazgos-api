import {
  toWallClock,
  wallClockToInstant,
  getOffsetMinutes,
  resolveTimeZone,
  isValidTimeZone,
} from './timezone.js';
describe('zonas horarias de plantas', () => {
  it('distingue el cambio de día en México y Colombia', () => {
    const instant = new Date('2026-10-21T05:30:00Z');
    expect(toWallClock(instant, 'America/Mexico_City')).toEqual({
      year: 2026,
      month: 10,
      day: 20,
      hour: 23,
      minute: 30,
      second: 0,
    });
    expect(toWallClock(instant, 'America/Bogota')).toEqual({
      year: 2026,
      month: 10,
      day: 21,
      hour: 0,
      minute: 30,
      second: 0,
    });
  });
  it.each(['2026-01-15T12:00:00Z', '2026-07-15T12:00:00Z'])(
    'convierte sin depender de la TZ del proceso: %s',
    (iso) => {
      for (const zone of [
        'America/Mexico_City',
        'America/Bogota',
        'America/New_York',
      ])
        expect(
          wallClockToInstant(
            toWallClock(new Date(iso), zone),
            zone,
          ).toISOString(),
        ).toBe(iso.replace('Z', '.000Z'));
    },
  );
  it('aplica desfases IANA históricos y de media hora', () => {
    expect(
      getOffsetMinutes(new Date('2026-10-21T00:00:00Z'), 'America/Bogota'),
    ).toBe(-300);
    expect(
      getOffsetMinutes(new Date('2026-10-21T00:00:00Z'), 'Asia/Kolkata'),
    ).toBe(330);
  });
  it('usa México para una zona ausente o inválida', () => {
    expect(isValidTimeZone('invalid/zone')).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(resolveTimeZone(null)).toBe('America/Mexico_City');
    expect(resolveTimeZone('America/Bogota')).toBe('America/Bogota');
  });
});
