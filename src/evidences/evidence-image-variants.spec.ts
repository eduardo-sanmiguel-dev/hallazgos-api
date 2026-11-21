import { Logger } from '@nestjs/common';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import fsPromises from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';
import { spanRecorder } from '../../test/utils/index.js';
import {
  ImageVariantCache,
  imageVariantsDir,
  preferredImageVariant,
} from './evidence-image-variants.js';

// Foto con algo de detalle: la variante pesa menos que el original.
const photo = (width: number, height: number) =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 160, b: 90 },
      noise: { type: 'gaussian', mean: 128, sigma: 40 },
    },
  });

describe('preferredImageVariant', () => {
  const accept = 'image/avif,image/webp,image/apng,*/*;q=0.8';

  it.each([
    [accept, 'a.jpg', 'avif'],
    ['image/webp,*/*', 'a.JPEG', 'webp'],
    ['IMAGE/AVIF', 'a.png', 'avif'],
    ['*/*', 'a.png', null],
    [undefined, 'a.jpg', null],
    // Un WEBP subido ya es liviano: se entrega tal cual.
    [accept, 'a.webp', null],
  ])('Accept %s con %s → %s', (header, filename, expected) => {
    expect(preferredImageVariant(header, filename)).toBe(expected);
  });
});

describe('imageVariantsDir', () => {
  const previous = process.env.IMAGE_VARIANTS_DIR;
  afterEach(() => {
    if (previous === undefined) delete process.env.IMAGE_VARIANTS_DIR;
    else process.env.IMAGE_VARIANTS_DIR = previous;
  });

  it('sin IMAGE_VARIANTS_DIR usa data/image-variants dentro del proyecto', () => {
    delete process.env.IMAGE_VARIANTS_DIR;
    expect(imageVariantsDir()).toBe(
      join(process.cwd(), 'data', 'image-variants'),
    );
  });

  it('IMAGE_VARIANTS_DIR la cambia', () => {
    process.env.IMAGE_VARIANTS_DIR = '/tmp/variantes';
    expect(imageVariantsDir()).toBe('/tmp/variantes');
  });
});

describe('ImageVariantCache', () => {
  const previous = process.env.IMAGE_VARIANTS_DIR;
  let temp: string;
  let originals: string;
  let variants: string;
  let cache: ImageVariantCache;

  beforeEach(() => {
    temp = mkdtempSync(join(tmpdir(), 'hallazgos-variants-'));
    originals = join(temp, 'originals');
    variants = join(temp, 'variants');
    mkdirSync(originals);
    process.env.IMAGE_VARIANTS_DIR = variants;
    cache = new ImageVariantCache();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (previous === undefined) delete process.env.IMAGE_VARIANTS_DIR;
    else process.env.IMAGE_VARIANTS_DIR = previous;
    rmSync(temp, { recursive: true, force: true });
  });

  const savePhoto = async (name: string, image = photo(320, 240)) => {
    const path = join(originals, name);
    await image.png().toFile(path);
    return path;
  };

  it.each(['avif', 'webp'] as const)(
    'genera la variante %s, la guarda y la reutiliza',
    async (format) => {
      const source = await savePhoto('foto.png');
      const rename = jest.spyOn(fsPromises, 'rename');

      const served = await cache.resolve(source, 'foto.png', format);
      expect(served).toBe(join(variants, `foto.png.${format}`));
      expect((await sharp(served).metadata()).format).toBe(
        format === 'avif' ? 'heif' : 'webp',
      );

      // La segunda vez (u otra instancia de la API) usa la guardada.
      expect(
        await new ImageVariantCache().resolve(source, 'foto.png', format),
      ).toBe(served);
      expect(rename).toHaveBeenCalledTimes(1);
    },
  );

  describe('traza de la conversión', () => {
    const recorder = spanRecorder();
    beforeAll(() => recorder.install());
    afterAll(() => recorder.uninstall());
    beforeEach(() => recorder.reset());

    it('un span por conversión, con el formato y la espera en cola', async () => {
      const source = await savePhoto('traza.png');

      await cache.resolve(source, 'traza.png', 'webp');
      // Ya guardada: no hay conversión ni span.
      await cache.resolve(source, 'traza.png', 'webp');

      expect(recorder.spans).toEqual([
        expect.objectContaining({
          name: 'image.variant',
          attributes: {
            'image.format': 'webp',
            'image.queue_ms': expect.any(Number),
          },
          ended: true,
        }),
      ]);
    });

    it('una conversión fallida lo marca en el span', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const source = join(originals, 'rota.png');
      writeFileSync(source, 'no es una imagen');

      await cache.resolve(source, 'rota.png', 'avif');

      expect(recorder.spans[0].attributes).toMatchObject({
        'image.failed': true,
      });
    });
  });

  it('aplica la orientación EXIF del original', async () => {
    const source = join(originals, 'girada.jpg');
    await photo(40, 20).jpeg().withMetadata({ orientation: 6 }).toFile(source);
    const served = await cache.resolve(source, 'girada.jpg', 'webp');
    const { width, height } = await sharp(served).metadata();
    expect([width, height]).toEqual([20, 40]);
  });

  it('entrega el original si la variante pesaría más', async () => {
    const source = join(originals, 'firma.png');
    await sharp({
      create: { width: 1, height: 1, channels: 3, background: 'white' },
    })
      .png()
      .toFile(source);
    expect(await cache.resolve(source, 'firma.png', 'avif')).toBe(source);
  });

  it('peticiones simultáneas de la misma foto la convierten una sola vez', async () => {
    const source = await savePhoto('lista.png');
    const rename = jest.spyOn(fsPromises, 'rename');
    const served = await Promise.all(
      Array.from({ length: 4 }, () =>
        cache.resolve(source, 'lista.png', 'webp'),
      ),
    );
    expect(new Set(served)).toEqual(
      new Set([join(variants, 'lista.png.webp')]),
    );
    expect(rename).toHaveBeenCalledTimes(1);
  });

  it('con muchas fotos nuevas convierte de a pocas y todas terminan', async () => {
    const names = ['a.png', 'b.png', 'c.png', 'd.png'];
    const sources = await Promise.all(names.map((name) => savePhoto(name)));
    const served = await Promise.all(
      sources.map((source, index) =>
        cache.resolve(source, names[index], 'webp'),
      ),
    );
    expect(served).toEqual(names.map((name) => join(variants, `${name}.webp`)));
  });

  it('si no se puede convertir entrega el original, avisa una vez y no reintenta', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const source = join(originals, 'rota.jpg');
    writeFileSync(source, 'no es una imagen');

    expect(await cache.resolve(source, 'rota.jpg', 'avif')).toBe(source);
    expect(await cache.resolve(source, 'rota.jpg', 'avif')).toBe(source);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('rota.jpg');
    // No deja temporales a medias.
    expect(existsSync(variants)).toBe(true);
    expect(await fsPromises.readdir(variants)).toEqual([]);
  });

  it('si el original desaparece entrega su ruta (el envío responde 404)', async () => {
    mkdirSync(variants);
    writeFileSync(join(variants, 'borrada.jpg.webp'), 'variante');
    const source = join(originals, 'borrada.jpg');
    expect(await cache.resolve(source, 'borrada.jpg', 'webp')).toBe(source);
  });
});
