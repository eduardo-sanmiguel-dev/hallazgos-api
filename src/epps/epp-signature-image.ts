// Posición de la firma en el formato de EPP (columna F).
//
// - Firmas nuevas (UI desde oct-2026: recortadas al trazo, transparentes, de
//   600 × 200 px como máximo): se respeta su proporción, caben en la celda y
//   quedan centradas con desplazamientos exactos en EMU.
// - Firmas anteriores (lienzo fijo de 300 × 200 o 500 × 200 px, con espacio
//   en blanco alrededor): se estiran a 100 × 25 px como siempre; con su
//   proporción se verían más chicas que hasta ahora.

/** Celda de firma: columna F de 20 caracteres y renglón de 20.1 pt, en px. */
export const SIGNATURE_CELL = { width: 145, height: (20.1 * 96) / 72 };
export const SIGNATURE_CELL_PADDING = 3;
const SIGNATURE_COLUMN = 5; // F (base 0)
const EMU_PER_PX = 9525;

const LEGACY_SIZES = [
  [300, 200],
  [500, 200],
];
const LEGACY_EXT = { width: 100, height: 25 };

/** Ancho y alto de un PNG, de su cabecera (IHDR); null si no es PNG. */
export const pngSize = (buffer: Buffer) => {
  const isPng =
    buffer.length >= 24 &&
    buffer.readUInt32BE(0) === 0x89504e47 &&
    buffer.toString('ascii', 12, 16) === 'IHDR';
  return isPng
    ? { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
    : null;
};

export const isLegacySignature = (size: { width: number; height: number }) =>
  LEGACY_SIZES.some(
    ([width, height]) => size.width === width && size.height === height,
  );

/** Posición (ancla y tamaño en px) para worksheet.addImage. `row` en base 0. */
export const signatureImagePosition = (png: Buffer, row: number) => {
  const size = pngSize(png);

  if (!size || isLegacySignature(size)) {
    return { tl: { col: SIGNATURE_COLUMN, row }, ext: LEGACY_EXT };
  }

  const scale = Math.min(
    (SIGNATURE_CELL.width - 2 * SIGNATURE_CELL_PADDING) / size.width,
    (SIGNATURE_CELL.height - 2 * SIGNATURE_CELL_PADDING) / size.height,
  );
  const ext = {
    width: Math.floor(size.width * scale),
    height: Math.floor(size.height * scale),
  };

  return {
    tl: {
      nativeCol: SIGNATURE_COLUMN,
      nativeColOff: Math.round(
        ((SIGNATURE_CELL.width - ext.width) / 2) * EMU_PER_PX,
      ),
      nativeRow: row,
      nativeRowOff: Math.round(
        ((SIGNATURE_CELL.height - ext.height) / 2) * EMU_PER_PX,
      ),
    },
    ext,
  };
};
