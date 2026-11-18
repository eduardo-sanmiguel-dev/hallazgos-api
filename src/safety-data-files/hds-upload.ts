import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { open, unlink } from 'fs/promises';
import { diskStorage } from 'multer';
import { basename, extname, join } from 'path';

/**
 * Carpeta de las hojas de datos de seguridad (PDF). Fuera del repositorio:
 * en el servidor es `hallazgos-api/data/hds` (ignorada por git, sobrevive al
 * `git reset --hard` del deploy, igual que las fotos de evidencias).
 * HDS_DIR la cambia (pruebas).
 */
export const hdsDir = () =>
  process.env.HDS_DIR || join(process.cwd(), 'data', 'hds');

/** Subidas en curso: en la misma carpeta (mismo disco) para moverlas sin copiar. */
const uploadsDir = () => join(hdsDir(), '.uploads');

/** Algunas HDS pesan más de 20 MB (fichas con imágenes escaneadas). */
const HDS_MAX_SIZE = 30 * 1024 * 1024;

const INVALID_PDF_MESSAGE = 'Solo se permiten archivos PDF.';

export const hdsUploadOptions = (): MulterOptions => ({
  storage: diskStorage({
    destination(_req, _file, callback) {
      const dir = uploadsDir();
      mkdirSync(dir, { recursive: true });
      callback(null, dir);
    },
    filename(_req, _file, callback) {
      callback(null, `${randomUUID()}.pdf`);
    },
  }),
  limits: { fileSize: HDS_MAX_SIZE, files: 1 },
  fileFilter(_req, file, callback) {
    if (extname(file.originalname).toLowerCase() !== '.pdf') {
      return callback(new BadRequestException(INVALID_PDF_MESSAGE), false);
    }
    callback(null, true);
  },
});

/**
 * Nombre visible de la HDS a partir del nombre del archivo subido. Multer
 * entrega el nombre como latin1: se pasa a UTF-8 para conservar acentos y ñ
 * ("ÁCIDO CÍTRICO.pdf"). Solo el nombre (sin carpetas) y sin caracteres de
 * control.
 */
export const hdsNameFromUpload = (originalName: string): string => {
  const utf8 = Buffer.from(originalName ?? '', 'latin1').toString('utf8');
  // Si no era UTF-8 válido, aparece "�": se usa el nombre tal cual.
  const decoded = utf8.includes('�') ? originalName : utf8;
  const name = basename(decoded.replace(/\\/g, '/'))
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!name || name.length > 200 || !/\.pdf$/i.test(name) || name === '.pdf') {
    throw new BadRequestException(
      'El nombre del archivo no es válido (debe terminar en .pdf y tener hasta 200 caracteres).',
    );
  }
  return name;
};

const readHeader = async (path: string) => {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(5);
    const { bytesRead } = await handle.read(buffer, 0, 5, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

/**
 * El contenido debe ser realmente un PDF (empieza con "%PDF-"): la extensión
 * sola no basta. Si no lo es, borra el archivo subido y responde 400. Exige
 * archivo.
 */
@Injectable()
export class PdfFileValidationPipe implements PipeTransform {
  async transform(file?: Express.Multer.File) {
    if (!file?.path) {
      throw new BadRequestException('Adjunta el archivo PDF.');
    }
    if ((await readHeader(file.path)).toString('latin1') !== '%PDF-') {
      await unlink(file.path).catch(() => undefined);
      throw new BadRequestException(INVALID_PDF_MESSAGE);
    }
    return file;
  }
}
