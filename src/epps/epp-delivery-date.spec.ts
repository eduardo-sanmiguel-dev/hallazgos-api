import { plantDeliveryDate } from './epp-delivery-date.js';

// Lo que guarda el transformer de la columna deliveryDate.
const stored = (date: Date) => date.toISOString().slice(0, 10);

describe('plantDeliveryDate', () => {
  it('México: una entrega a las 18:30 se guarda con el mismo día', () => {
    // 14/10/2026 18:30 en México = 15/10/2026 00:30 UTC.
    const at = new Date('2026-10-15T00:30:00Z');
    expect(stored(plantDeliveryDate(at, 'México'))).toBe('2026-10-14');
  });

  it('Colombia: una entrega a las 19:30 se guarda con el mismo día', () => {
    // 14/10/2026 19:30 en Bogotá = 15/10/2026 00:30 UTC.
    const at = new Date('2026-10-15T00:30:00Z');
    expect(stored(plantDeliveryDate(at, 'Colombia'))).toBe('2026-10-14');
  });

  it('Colombia usa su propia zona (una hora antes que en UTC-6)', () => {
    // 15/10/2026 00:30 en Bogotá = 14/10/2026 23:30 en México.
    const at = new Date('2026-10-15T05:30:00Z');
    expect(stored(plantDeliveryDate(at, 'Colombia'))).toBe('2026-10-15');
    expect(stored(plantDeliveryDate(at, 'México'))).toBe('2026-10-14');
  });

  it('en la mañana no cambia el día', () => {
    const at = new Date('2026-10-14T14:00:00Z');
    expect(stored(plantDeliveryDate(at, 'México'))).toBe('2026-10-14');
    expect(stored(plantDeliveryDate(at, 'Colombia'))).toBe('2026-10-14');
  });

  it('sin país usa México, como el resto del sistema', () => {
    const at = new Date('2026-10-15T00:30:00Z');
    expect(stored(plantDeliveryDate(at, null))).toBe('2026-10-14');
  });
});
