import {
  formatUtcOffsetShort,
  formatWallClockDate,
  getOffsetMinutes,
  resolveTimeZone,
  toWallClock,
} from './timezone';

const removeDiacritics = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Parte de nombre de archivo segura en Windows/macOS: sin acentos, espacios ni / \ : * ? " < > | */
export const sanitizeFileNamePart = (value: string, fallback = 'Archivo') =>
  removeDiacritics(value)
    .replace(/[/\\:*?"<>|]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._+-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '') || fallback;

/** Palabras sin acentos (Ñ → N) ni símbolos, listas para un nombre de archivo. */
export const fileNameWords = (value?: string | null): string[] =>
  removeDiacritics(value ?? '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

/** "OPERARIO DE ASEO" → "OperarioDeAseo" */
export const toPascalCaseFileNamePart = (words: string[]) =>
  words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');

/**
 * "AAAA-MM-DD_HHmm_UTC±HH" en la zona del usuario (America/Mexico_City si no
 * llega o no es válida), para el final de los nombres de archivo descargados.
 */
export const buildFileNameTimestamp = (
  timeZone?: string | null,
  date = new Date(),
) => {
  const zone = resolveTimeZone(timeZone);
  const wall = toWallClock(date, zone);
  const pad = (n: number) => n.toString().padStart(2, '0');

  return [
    formatWallClockDate(wall),
    `${pad(wall.hour)}${pad(wall.minute)}`,
    formatUtcOffsetShort(getOffsetMinutes(date, zone)),
  ].join('_');
};

/** Content-Disposition con filename (ASCII) y filename* (UTF-8). */
export const buildAttachmentContentDisposition = (fileName: string) =>
  `attachment; filename="${fileName.replace(/["\\]/g, '')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
