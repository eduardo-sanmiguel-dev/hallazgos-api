import {
  pngSize,
  SIGNATURE_CELL,
  signatureImagePosition,
} from './epp-signature-image.js';

/** Cabecera mínima de un PNG (firma + IHDR) con el tamaño dado. */
const pngHeader = (width: number, height: number) => {
  const buffer = Buffer.alloc(33);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
};

const EMU_PER_PX = 9525;

describe('Posición de la firma en el formato de EPP', () => {
  it('lee el tamaño de la cabecera del PNG', () => {
    expect(pngSize(pngHeader(600, 135))).toEqual({ width: 600, height: 135 });
    expect(pngSize(Buffer.from('no es png'))).toBeNull();
  });

  it.each([
    [300, 200],
    [500, 200],
  ])(
    'una firma anterior (%i × %i) se estira a 100 × 25 como siempre',
    (width, height) => {
      expect(signatureImagePosition(pngHeader(width, height), 8)).toEqual({
        tl: { col: 5, row: 8 },
        ext: { width: 100, height: 25 },
      });
    },
  );

  it('un archivo que no es PNG conserva la posición de siempre', () => {
    expect(signatureImagePosition(Buffer.from('x'), 9).ext).toEqual({
      width: 100,
      height: 25,
    });
  });

  it.each([
    ['horizontal', 600, 135],
    ['vertical (lienzo 2.5:1)', 600, 240],
    ['corta', 180, 60],
  ])(
    'una firma nueva %s respeta su proporción, cabe en la celda y queda centrada',
    (_name, width, height) => {
      const { tl, ext } = signatureImagePosition(pngHeader(width, height), 10);

      // Misma proporción, salvo el redondeo a px enteros (menos de 5 %).
      expect(
        Math.abs(ext.width / ext.height / (width / height) - 1),
      ).toBeLessThan(0.05);
      expect(ext.width).toBeLessThanOrEqual(SIGNATURE_CELL.width - 6);
      expect(ext.height).toBeLessThanOrEqual(SIGNATURE_CELL.height - 6);
      // Centrada: el mismo espacio a cada lado (en EMU).
      expect(tl).toMatchObject({ nativeCol: 5, nativeRow: 10 });
      const { nativeColOff, nativeRowOff } = tl as {
        nativeColOff: number;
        nativeRowOff: number;
      };
      expect(nativeColOff / EMU_PER_PX).toBeCloseTo(
        (SIGNATURE_CELL.width - ext.width) / 2,
        0,
      );
      expect(nativeRowOff / EMU_PER_PX).toBeCloseTo(
        (SIGNATURE_CELL.height - ext.height) / 2,
        0,
      );
    },
  );
});
