import { existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';

import { createTempDir, removeTempDir } from './temp-dir';

describe('temp-dir', () => {
  it('crea una carpeta distinta en cada llamada', async () => {
    const [first, second] = await Promise.all([
      createTempDir('test'),
      createTempDir('test'),
    ]);

    expect(first).not.toBe(second);
    expect(existsSync(first)).toBe(true);
    expect(existsSync(second)).toBe(true);

    await Promise.all([removeTempDir(first), removeTempDir(second)]);
  });

  it('borra la carpeta con su contenido', async () => {
    const dir = await createTempDir('test');
    await writeFile(join(dir, 'archivo.xlsx'), 'contenido');

    await removeTempDir(dir);

    expect(existsSync(dir)).toBe(false);
  });

  it('no falla si la carpeta ya no existe', async () => {
    await expect(removeTempDir(join(__dirname, 'no-existe'))).resolves.toBe(
      undefined,
    );
  });
});
