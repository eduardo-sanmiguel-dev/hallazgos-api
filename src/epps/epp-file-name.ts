import {
  fileNameWords,
  sanitizeFileNamePart,
  toPascalCaseFileNamePart,
} from '../shared/utils/file-name';

export const EPP_FILE_NAME_MAX_LENGTH = 150;

/** Palabras que se conservan del nombre al recortar: apellidos + primer nombre. */
const SHORT_NAME_WORDS = 3;

interface EppFileNameParts {
  plants: string[];
  code?: number | string | null;
  employeeName?: string | null;
  position?: string | null;
  /** "AAAA-MM-DD_HHmm_UTC±HH" de buildFileNameTimestamp */
  timestamp: string;
}

/**
 * EPP_{Planta}_{NumEmpleado}_{ApellidosNombre}_{Cargo}_{AAAA-MM-DD}_{HHmm}_UTC±HH.xlsx
 *
 * Las partes vacías se omiten. Si pasa de EPP_FILE_NAME_MAX_LENGTH se recorta
 * primero el nombre del empleado (apellidos + primer nombre, luego caracteres) y
 * después el cargo; planta, número, fecha y zona nunca se recortan.
 */
export const buildEppFileName = ({
  plants,
  code,
  employeeName,
  position,
  timestamp,
}: EppFileNameParts) => {
  const plant = plants
    .map((name) => sanitizeFileNamePart(name, ''))
    .filter(Boolean)
    .join('+');
  const number = sanitizeFileNamePart(String(code ?? ''), '');

  const nameWords = fileNameWords(employeeName);
  const positionWords = fileNameWords(position);

  const compose = (name: string, positionPart: string) =>
    `${['EPP', plant, number, name, positionPart, timestamp].filter(Boolean).join('_')}.xlsx`;

  let name = toPascalCaseFileNamePart(nameWords);
  let positionPart = toPascalCaseFileNamePart(positionWords);
  const overflow = () =>
    compose(name, positionPart).length - EPP_FILE_NAME_MAX_LENGTH;

  if (overflow() > 0) {
    name = toPascalCaseFileNamePart(nameWords.slice(0, SHORT_NAME_WORDS));
  }

  // Recorta caracteres de `value` sin bajar de `min`.
  const cut = (value: string, min: number) =>
    value.slice(0, Math.max(min, value.length - overflow()));

  if (overflow() > 0) {
    // Nombre hasta el primer apellido como mínimo, luego el cargo.
    name = cut(name, toPascalCaseFileNamePart(nameWords.slice(0, 1)).length);
  }

  if (overflow() > 0) {
    positionPart = cut(positionPart, 0);
  }

  if (overflow() > 0) {
    name = cut(name, 1);
  }

  return compose(name, positionPart);
};
