import { randomUUID } from 'crypto';
import { rmSync, writeFileSync } from 'fs';
import path from 'path';

import { uploadStaticImage } from './index.js';

// Imágenes del PDF de hallazgos (y logos): se leen de public/static/images
// con una ruta relativa.
describe('uploadStaticImage', () => {
  const name = `upload-static-image-${randomUUID()}.png`;
  const file = path.join(
    process.cwd(),
    'public',
    'static',
    'images',
    'evidences',
    name,
  );
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

  beforeAll(() => writeFileSync(file, bytes));
  afterAll(() => rmSync(file, { force: true }));

  it('lee una foto de evidencias con ruta relativa', () => {
    expect(uploadStaticImage(`evidences/${name}`)).toBe(
      bytes.toString('base64'),
    );
  });

  it('una ruta con "/" al inicio se rechaza (así el PDF salía sin fotos)', () => {
    expect(uploadStaticImage(`/evidences/${name}`)).toBeNull();
  });

  it('sin nombre, un archivo que no existe o fuera de la carpeta: null', () => {
    expect(uploadStaticImage('')).toBeNull();
    expect(uploadStaticImage('evidences/no-existe.png')).toBeNull();
    expect(uploadStaticImage('../../package.json')).toBeNull();
  });
});
