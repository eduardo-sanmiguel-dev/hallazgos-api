import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { randomUUID } from 'crypto';
import { open, unlink } from 'fs/promises';
import { diskStorage } from 'multer';
import { extname } from 'path';

export const EVIDENCE_IMAGES_DIR = './public/static/images/evidences';

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2 MB

// Mismos tipos que ya se suben (UI y móvil): jpg/jpeg, png y webp.
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

const INVALID_IMAGE_MESSAGE = 'Solo se permiten imágenes JPG, PNG o WEBP';

/**
 * Opciones de multer para imágenes de evidencias. El nombre lo genera el
 * servidor (uuid + sufijo + extensión): antes se usaba el que mandaba el
 * cliente y un nombre repetido sobrescribía la imagen de otro registro.
 */
export const imageUploadOptions = (suffix: string): MulterOptions => ({
  storage: diskStorage({
    destination: EVIDENCE_IMAGES_DIR,
    filename(_req, file, callback) {
      const extension = extname(file.originalname).toLowerCase();
      callback(null, `${randomUUID()}-${suffix}${extension}`);
    },
  }),
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
  fileFilter(_req, file, callback) {
    const extension = extname(file.originalname).toLowerCase();

    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return callback(new BadRequestException(INVALID_IMAGE_MESSAGE), false);
    }

    callback(null, true);
  },
});

const startsWith = (bytes: Buffer, signature: number[], offset = 0) =>
  signature.every((byte, idx) => bytes[offset + idx] === byte);

/** Revisa la firma binaria: el contenido debe ser realmente JPG, PNG o WEBP. */
export const isAllowedImageContent = (bytes: Buffer) =>
  startsWith(bytes, [0xff, 0xd8, 0xff]) ||
  startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||
  (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && // RIFF
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)); // WEBP

const readHeader = async (path: string) => {
  const handle = await open(path, 'r');

  try {
    const buffer = Buffer.alloc(12);
    const { bytesRead } = await handle.read(buffer, 0, 12, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

/**
 * Valida el contenido del archivo ya guardado; si no es una imagen permitida
 * lo borra y responde 400. La extensión sola no basta (se puede renombrar un
 * .html a .png). Sin archivo deja pasar: cada endpoint decide si es opcional.
 */
@Injectable()
export class ImageFileValidationPipe implements PipeTransform {
  async transform(file?: Express.Multer.File) {
    if (!file?.path) return file;

    if (!isAllowedImageContent(await readHeader(file.path))) {
      await unlink(file.path).catch(() => undefined);
      throw new BadRequestException(INVALID_IMAGE_MESSAGE);
    }

    return file;
  }
}
