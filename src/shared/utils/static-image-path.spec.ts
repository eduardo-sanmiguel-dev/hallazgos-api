import { randomUUID } from 'crypto';
import { rmSync, writeFileSync } from 'fs';
import path from 'path';

import { staticImagePath } from './index.js';

// Imágenes del PDF de hallazgos: se buscan en public/static/images con una
// ruta relativa.
describe('staticImagePath', () => {
  const name = `static-image-path-${randomUUID()}.png`;
  const file = path.join(
    process.cwd(),
    'public',
    'static',
    'images',
    'evidences',
    name,
  );

  beforeAll(() => writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47])));
  afterAll(() => rmSync(file, { force: true }));

  it('resuelve una foto de evidencias con ruta relativa', () => {
    expect(staticImagePath(`evidences/${name}`)).toBe(file);
  });

  it('una ruta con "/" al inicio se rechaza (así el PDF salía sin fotos)', () => {
    expect(staticImagePath(`/evidences/${name}`)).toBeNull();
  });

  it('sin nombre, un archivo que no existe o fuera de la carpeta: null', () => {
    expect(staticImagePath('')).toBeNull();
    expect(staticImagePath('evidences/no-existe.png')).toBeNull();
    expect(staticImagePath('../../package.json')).toBeNull();
  });
});
