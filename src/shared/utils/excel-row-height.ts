// Estimación de la altura de fila que necesita un texto con "ajustar texto" en
// Excel. Excel no recalcula la altura al abrir un archivo cuyas filas tienen
// altura fija, así que la calculamos al generarlo.
//
// El texto se mide como lo dibuja Excel en pantalla (96 ppp): cada carácter de
// Arial ocupa un número entero de píxeles (ancho de avance redondeado), y se
// ajusta por palabras y guiones como lo hace Excel.

// prettier-ignore
const ARIAL_WIDTHS: Record<string, number> = {
  ' ': 278, '.': 278, ',': 278, ':': 278, ';': 278, '/': 278, '-': 333,
  '(': 333, ')': 333, '#': 556, '%': 889, '&': 667, '+': 584, '"': 355,
  "'": 191,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222,
  j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333,
  s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278,
  J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
  S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
};
const DEFAULT_CHAR_WIDTH = 556; // dígitos y caracteres no listados

// Ancho útil: el ancho de columna de Excel (w) ya incluye 5 px de relleno, así
// que la columna mide round(w*7) px y el texto dispone de 5 px menos.
// Validado contra descargas reales en Excel (Arial 10):
//   columna R (23.14 → 157 px útiles): "Mantenimiento junio 2027" (148 px) y
//     "Mantenimiento marzo 2027" (157 px) caben; "Mantenimiento octubre 2026"
//     (163 px) se parte.
//   columna C (7.43 → 47 px útiles): "F1E-01" (42 px) cabe; "F4E-321" (49 px)
//     se parte en "F4E-" / "321".
const PX_PER_WIDTH_UNIT = 7;
const COLUMN_PADDING_PX = 5;
const LINE_HEIGHT_FACTOR = 1.25;
const VERTICAL_PADDING_PT = 3;

const charWidthEm = (char: string) => {
  const base = char.normalize('NFD').charAt(0); // á → a, Ñ → N
  return (ARIAL_WIDTHS[base] ?? DEFAULT_CHAR_WIDTH) / 1000;
};

const textWidthPx = (text: string, fontPx: number) =>
  [...text].reduce(
    (sum, char) => sum + Math.round(charWidthEm(char) * fontPx),
    0,
  );

/**
 * Líneas que ocupa el texto en la columna. Como Excel, parte en los espacios y
 * también después de un guion ("F4E-321" → "F4E-" / "321").
 */
export const countWrappedLines = (
  text: string,
  columnWidth: number,
  fontSizePt: number,
) => {
  const fontPx = (fontSizePt * 96) / 72;
  const maxPx = Math.round(columnWidth * PX_PER_WIDTH_UNIT) - COLUMN_PADDING_PX;
  const spacePx = textWidthPx(' ', fontPx);

  return text.split(/\r?\n/).reduce((total, paragraph) => {
    let lines = 1;
    let currentPx = 0;

    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      // Trozos de la palabra entre los que Excel puede cortar (tras cada "-").
      const pieces = word.match(/[^-]*-+|[^-]+$/g) ?? [word];

      pieces.forEach((piece, index) => {
        const piecePx = textWidthPx(piece, fontPx);
        // Antes del primer trozo va un espacio; los demás van pegados.
        const gapPx = currentPx > 0 && index === 0 ? spacePx : 0;

        // Un trozo más ancho que la columna se parte en varias líneas.
        if (piecePx > maxPx) {
          if (currentPx > 0) lines++;
          lines += Math.ceil(piecePx / maxPx) - 1;
          currentPx = piecePx % maxPx;
          return;
        }

        if (currentPx + gapPx + piecePx > maxPx) {
          lines++;
          currentPx = piecePx;
        } else {
          currentPx += gapPx + piecePx;
        }
      });
    }

    return total + lines;
  }, 0);
};

/** Altura en puntos para mostrar todas las líneas del texto. */
export const wrappedTextHeight = (
  text: string,
  columnWidth: number,
  fontSizePt: number,
) =>
  countWrappedLines(text, columnWidth, fontSizePt) *
    fontSizePt *
    LINE_HEIGHT_FACTOR +
  VERTICAL_PADDING_PT;
