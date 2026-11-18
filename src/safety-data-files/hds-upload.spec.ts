import { BadRequestException } from '@nestjs/common';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import fsPromises from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  hdsDir,
  hdsNameFromUpload,
  PdfFileValidationPipe,
} from './hds-upload.js';

describe('hds-upload', () => {
  describe('hdsDir', () => {
    const previousDir = process.env.HDS_DIR;

    afterEach(() => {
      if (previousDir === undefined) delete process.env.HDS_DIR;
      else process.env.HDS_DIR = previousDir;
    });

    it('sin HDS_DIR usa data/hds dentro del proyecto', () => {
      delete process.env.HDS_DIR;

      expect(hdsDir()).toBe(join(process.cwd(), 'data', 'hds'));
    });
  });

  describe('hdsNameFromUpload', () => {
    it('sin nombre responde 400', () => {
      expect(() => hdsNameFromUpload(undefined as never)).toThrow(
        BadRequestException,
      );
    });

    it('un nombre que no es UTF-8 en latin1 se usa tal cual', () => {
      // "Ñ" suelto en latin1 (0xD1) no es UTF-8 válido.
      expect(hdsNameFromUpload('PEÑA.pdf')).toBe('PEÑA.pdf');
    });
  });

  describe('PdfFileValidationPipe', () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'hds-pipe-'));
    });

    afterEach(() => {
      jest.restoreAllMocks();
      rmSync(dir, { recursive: true, force: true });
    });

    it('si no se puede borrar el archivo que no es PDF igual responde 400', async () => {
      const path = join(dir, 'falso.pdf');
      writeFileSync(path, 'no soy pdf');
      jest.spyOn(fsPromises, 'unlink').mockRejectedValue(new Error('EBUSY'));

      await expect(
        new PdfFileValidationPipe().transform({
          path,
        } as Express.Multer.File),
      ).rejects.toThrow(
        new BadRequestException('Solo se permiten archivos PDF.'),
      );
    });
  });
});
