import { BadRequestException } from '@nestjs/common';
import { existsSync } from 'fs';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  ImageFileValidationPipe,
  imageUploadOptions,
  isAllowedImageContent,
} from './image-upload';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

describe('image-upload', () => {
  describe('isAllowedImageContent', () => {
    it.each([
      ['PNG', PNG],
      ['JPEG', JPEG],
      ['WEBP', WEBP],
    ])('acepta %s', (_name, bytes) => {
      expect(isAllowedImageContent(bytes)).toBe(true);
    });

    it.each([
      ['HTML', HTML],
      ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
      ['RIFF que no es WEBP', Buffer.from('RIFF\0\0\0\0WAVEfmt ')],
      ['vacío', Buffer.alloc(0)],
    ])('rechaza %s', (_name, bytes) => {
      expect(isAllowedImageContent(bytes)).toBe(false);
    });
  });

  describe('imageUploadOptions', () => {
    const options = imageUploadOptions('evidence');

    const filter = (originalname: string) =>
      new Promise<{ error: Error | null; accepted: boolean }>((resolve) =>
        options.fileFilter(
          {} as never,
          { originalname } as Express.Multer.File,
          (error: Error | null, accepted?: boolean) =>
            resolve({ error, accepted: !!accepted }),
        ),
      );

    it.each(['foto.jpg', 'foto.JPEG', 'foto.png', 'foto.webp'])(
      'acepta la extensión de %s',
      async (name) => {
        expect(await filter(name)).toEqual({ error: null, accepted: true });
      },
    );

    it.each(['ataque.html', 'imagen.svg', 'sin-extension', 'foto.png.exe'])(
      'rechaza %s',
      async (name) => {
        const { error, accepted } = await filter(name);
        expect(accepted).toBe(false);
        expect(error).toBeInstanceOf(BadRequestException);
      },
    );

    it('limita a un archivo de 2 MB', () => {
      expect(options.limits).toEqual({ fileSize: 2 * 1024 * 1024, files: 1 });
    });
  });

  describe('ImageFileValidationPipe', () => {
    const pipe = new ImageFileValidationPipe();
    let dir: string;

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'image-upload-spec-'));
    });

    afterEach(() => rm(dir, { recursive: true, force: true }));

    const saved = async (bytes: Buffer) => {
      const path = join(dir, 'archivo.png');
      await writeFile(path, bytes);
      return { path } as Express.Multer.File;
    };

    it('deja pasar una imagen válida', async () => {
      const file = await saved(PNG);
      await expect(pipe.transform(file)).resolves.toBe(file);
      expect(existsSync(file.path)).toBe(true);
    });

    it('borra el archivo y responde 400 si no es imagen', async () => {
      const file = await saved(HTML);
      await expect(pipe.transform(file)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(existsSync(file.path)).toBe(false);
    });

    it('deja pasar cuando no se envía archivo', async () => {
      await expect(pipe.transform(undefined)).resolves.toBeUndefined();
    });
  });
});
