import { countWrappedLines, wrappedTextHeight } from './excel-row-height';

// Anchos y fuentes reales de la plantilla RGOSGSST49.
const TYPE = { width: 13.5703125, font: 8 }; // columna D (tipo)
const OBS = { width: 23.140625, font: 10 }; // columna R (observaciones)

describe('countWrappedLines', () => {
  it('textos que en la captura caben en una línea', () => {
    expect(countWrappedLines('CO2', TYPE.width, TYPE.font)).toBe(1);
    expect(countWrappedLines('PQS', TYPE.width, TYPE.font)).toBe(1);
    expect(
      countWrappedLines('Mantenimiento junio 2027', OBS.width, OBS.font),
    ).toBe(1);
    expect(
      countWrappedLines('Mantenimiento marzo 2027', OBS.width, OBS.font),
    ).toBe(1);
  });

  it('textos que en la captura se cortaban', () => {
    expect(
      countWrappedLines('Extintor de Solkaflan', TYPE.width, TYPE.font),
    ).toBe(2);
    expect(
      countWrappedLines('Mantenimiento octubre 2026', OBS.width, OBS.font),
    ).toBe(2);
    expect(
      countWrappedLines(
        'Mantenimiento y prueba hidrostatica octubre 2026',
        OBS.width,
        OBS.font,
      ),
    ).toBe(2);
  });

  it('respeta saltos de línea y parte palabras más anchas que la columna', () => {
    expect(countWrappedLines('uno\ndos', OBS.width, OBS.font)).toBe(2);
    // W en Arial 8 = 10 px; columna D = round(13.57*7) - 5 = 90 px útiles.
    expect(countWrappedLines('W'.repeat(60), TYPE.width, TYPE.font)).toBe(
      Math.ceil((60 * 10) / 90),
    );
  });
});

describe('countWrappedLines en la columna EXTINTOR Nº', () => {
  const NUM = { width: 7.42578125, font: 10 }; // columna C

  it('códigos cortos caben en una línea', () => {
    expect(countWrappedLines('3', NUM.width, NUM.font)).toBe(1);
    expect(countWrappedLines('F1E-01', NUM.width, NUM.font)).toBe(1);
    expect(countWrappedLines('F2E-10', NUM.width, NUM.font)).toBe(1);
  });

  it('parte después del guion cuando no cabe (captura: "F4E-" / "321")', () => {
    expect(countWrappedLines('F4E-321', NUM.width, NUM.font)).toBe(2);
    expect(countWrappedLines('F4E-3210', NUM.width, NUM.font)).toBe(2);
    expect(countWrappedLines('EXT-PB-0012', NUM.width, NUM.font)).toBe(3);
  });

  it('un código sin guiones más ancho que la columna se parte por caracteres', () => {
    expect(countWrappedLines('FE40031999', NUM.width, NUM.font)).toBe(2);
  });

  it('no cambia los textos sin guiones', () => {
    expect(
      countWrappedLines('Mantenimiento octubre 2026', OBS.width, OBS.font),
    ).toBe(2);
  });
});

describe('wrappedTextHeight', () => {
  it('una línea de Arial 10 no supera la altura de la plantilla (15 pt)', () => {
    expect(wrappedTextHeight('C', 3.5, 10)).toBeLessThanOrEqual(15.5);
  });

  it('crece con el número de líneas', () => {
    expect(
      wrappedTextHeight(
        'Mantenimiento y prueba hidrostatica octubre 2026',
        OBS.width,
        OBS.font,
      ),
    ).toBeCloseTo(2 * 10 * 1.25 + 3);
  });
});
