import { Logger } from '@nestjs/common';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';

import { ImageVariantCache } from './evidence-image-variants.js';
import { backfillImageVariants } from './image-variants-backfill.js';

describe('backfillImageVariants', () => {
  const previous = process.env.IMAGE_VARIANTS_DIR;
  let temp: string;
  let originals: string;
  let variants: string;
  let log: jest.Mock;

  const savePhoto = (name: string) =>
    sharp({
      create: {
        width: 64,
        height: 48,
        channels: 3,
        background: { r: 120, g: 160, b: 90 },
        noise: { type: 'gaussian', mean: 128, sigma: 40 },
      },
    })
      .jpeg()
      .toFile(join(originals, name));

  beforeEach(() => {
    temp = mkdtempSync(join(tmpdir(), 'hallazgos-backfill-'));
    originals = join(temp, 'evidences');
    variants = join(temp, 'variants');
    mkdirSync(originals);
    process.env.IMAGE_VARIANTS_DIR = variants;
    log = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (previous === undefined) delete process.env.IMAGE_VARIANTS_DIR;
    else process.env.IMAGE_VARIANTS_DIR = previous;
    rmSync(temp, { recursive: true, force: true });
  });

  it('convierte a AVIF las fotos JPG/PNG sin variante, salta las demás y cuenta las fallidas', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    await savePhoto('a.jpg');
    await savePhoto('b.jpeg');
    await savePhoto('ya.jpg');
    mkdirSync(variants);
    writeFileSync(join(variants, 'ya.jpg.avif'), 'variante');
    writeFileSync(join(originals, 'rota.png'), 'no es una imagen');
    // Un WEBP ya es liviano: no lleva variante.
    writeFileSync(join(originals, 'liviana.webp'), 'webp');

    const summary = await backfillImageVariants({
      directory: originals,
      log,
      progressEvery: 2,
    });

    expect(summary).toEqual({ total: 4, created: 2, skipped: 1, failed: 1 });
    expect(existsSync(join(variants, 'a.jpg.avif'))).toBe(true);
    expect(existsSync(join(variants, 'b.jpeg.avif'))).toBe(true);
    expect(log.mock.calls.map(([message]) => message)).toEqual([
      `4 fotos JPG/PNG en ${originals}`,
      '2/4: {"total":4,"created":2,"skipped":0,"failed":0}',
      '4/4: {"total":4,"created":2,"skipped":1,"failed":1}',
      'Terminado: {"total":4,"created":2,"skipped":1,"failed":1}',
    ]);
  });

  it('una segunda corrida no convierte nada', async () => {
    await savePhoto('a.jpg');
    await backfillImageVariants({ directory: originals, log });
    const prepare = jest.spyOn(ImageVariantCache.prototype, 'prepare');

    await expect(
      backfillImageVariants({ directory: originals, log }),
    ).resolves.toEqual({ total: 1, created: 0, skipped: 1, failed: 0 });
    expect(prepare).not.toHaveBeenCalled();
  });

  it('por omisión usa la carpeta de fotos del proyecto y escribe en consola', async () => {
    jest.spyOn(process, 'cwd').mockReturnValue(temp);
    mkdirSync(join(temp, 'public', 'static', 'images', 'evidences'), {
      recursive: true,
    });
    const output = jest.spyOn(console, 'log').mockImplementation();

    await expect(backfillImageVariants()).resolves.toEqual({
      total: 0,
      created: 0,
      skipped: 0,
      failed: 0,
    });
    expect(output).toHaveBeenCalledWith(expect.stringContaining('Terminado'));
  });
});
