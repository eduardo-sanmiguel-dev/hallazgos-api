import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Carpeta temporal única por petición para generar archivos (Excel, firmas).
 * Con rutas fijas compartidas, dos descargas simultáneas se pisaban y un
 * usuario podía recibir el archivo de otro.
 */
export const createTempDir = (prefix: string) =>
  mkdtemp(join(tmpdir(), `hallazgos-${prefix}-`));

/** Borra la carpeta temporal; un fallo al limpiar no debe afectar la respuesta. */
export const removeTempDir = (dir: string) =>
  rm(dir, { recursive: true, force: true }).catch(() => undefined);
