import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';

import { pdfThumbnails } from './pdf-thumbnail.js';

const decode = (uri: string) =>
  Buffer.from(uri.replace(/^data:image\/jpeg;base64,/, ''), 'base64');

describe('pdfThumbnails', () => {
  let dir: string;
  const file = (name: string) => join(dir, name);

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hallazgos-pdf-thumbnail-'));
    const photo = sharp({
      create: { width: 800, height: 400, channels: 3, background: '#3366cc' },
    });
    await photo.clone().webp().toFile(file('foto.webp'));
    await photo.clone().jpeg().toFile(file('foto.jpg'));
    await sharp({
      create: {
        width: 40,
        height: 40,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toFile(file('transparente.png'));
    await writeFile(file('no-es-imagen.png'), 'texto');
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('convierte WebP (que pdfmake no acepta) a una miniatura JPG de 100 px', async () => {
    const [thumbnail] = await pdfThumbnails([file('foto.webp')]);

    expect(thumbnail).toMatch(/^data:image\/jpeg;base64,/);
    const meta = await sharp(decode(thumbnail)).metadata();
    expect(meta.format).toBe('jpeg');
    // Proporción conservada dentro de 100×100.
    expect([meta.width, meta.height]).toEqual([100, 50]);
    expect(decode(thumbnail).length).toBeLessThan(5000);
  });

  it('no agranda imágenes chicas y aplana la transparencia en blanco', async () => {
    const [thumbnail] = await pdfThumbnails([file('transparente.png')]);

    const { data, info } = await sharp(decode(thumbnail))
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.channels]).toEqual([40, 40, 3]);
    expect(data[0]).toBeGreaterThan(245);
  });

  it('respeta el orden, repite las iguales y devuelve null sin archivo o si no es imagen', async () => {
    const result = await pdfThumbnails([
      file('foto.jpg'),
      null,
      file('no-es-imagen.png'),
      file('no-existe.jpg'),
      file('foto.jpg'),
      file('foto.webp'),
    ]);

    expect(result[0]).toMatch(/^data:image\/jpeg;base64,/);
    expect(result.slice(1, 4)).toEqual([null, null, null]);
    expect(result[4]).toBe(result[0]);
    expect(result[5]).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('sin imágenes no hace nada', async () => {
    await expect(pdfThumbnails([])).resolves.toEqual([]);
  });
});
