import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { safeFilePath } from './safe-file-path';
describe('safeFilePath', () => {
  let temp: string;
  let root: string;
  beforeEach(() => {
    temp = mkdtempSync(join(tmpdir(), 'hallazgos-path-'));
    root = join(temp, 'root');
    mkdirSync(root);
    mkdirSync(join(root, 'nested'));
    writeFileSync(join(root, 'nested', 'image.png'), 'image');
    writeFileSync(join(temp, 'secret.txt'), 'secret');
  });
  afterEach(() => rmSync(temp, { recursive: true, force: true }));
  it('permite archivos regulares dentro de la carpeta', () =>
    expect(safeFilePath(root, 'nested/image.png')).toBe(
      join(root, 'nested', 'image.png'),
    ));
  it.each([
    '../secret.txt',
    '..\\secret.txt',
    'nested/../../secret.txt',
    '/secret.txt',
    '',
    'a\0.png',
    'nested',
    'missing.png',
  ])('rechaza rutas inseguras o inexistentes: %s', (name) =>
    expect(safeFilePath(root, name)).toBeNull(),
  );
  it('rechaza rutas absolutas y carpetas raíz inexistentes', () => {
    expect(safeFilePath(root, join(temp, 'secret.txt'))).toBeNull();
    expect(safeFilePath(join(temp, 'absent'), 'image.png')).toBeNull();
  });
  it('no permite escapar por un enlace simbólico de directorio', () => {
    symlinkSync(
      temp,
      join(root, 'outside'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    expect(safeFilePath(root, 'outside/secret.txt')).toBeNull();
  });
});
