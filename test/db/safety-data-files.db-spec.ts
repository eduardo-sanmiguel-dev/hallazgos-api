/**
 * E2E (app completa + base de pruebas): hojas de datos de seguridad (HDS).
 * Los PDF van a una carpeta temporal (HDS_DIR), fuera del repositorio.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { SafetyDataFile } from '../../src/safety-data-files/entities/safety-data-file.entity.js';
import { binaryParser } from '../utils/index.js';
import { createE2eApp, type E2eApp } from './e2e-app.js';

const pdf = (text: string) => Buffer.from(`%PDF-1.4\n${text}\n%%EOF`);

describe('E2E: HDS (PDF fuera del repositorio)', () => {
  let e2e: E2eApp;
  const dir = mkdtempSync(join(tmpdir(), 'hds-e2e-'));
  const previousDir = process.env.HDS_DIR;

  beforeAll(async () => {
    process.env.HDS_DIR = dir;
    e2e = await createE2eApp();
  });

  afterAll(async () => {
    await e2e?.close();
    rmSync(dir, { recursive: true, force: true });
    if (previousDir === undefined) delete process.env.HDS_DIR;
    else process.env.HDS_DIR = previousDir;
  });

  const list = async () =>
    (
      await e2e
        .call('get', '/safety-data-files', e2e.tokens.general)
        .expect(200)
    ).body.map(({ name }: { name: string }) => name);

  const download = (name: string, token = e2e.tokens.general) =>
    e2e
      .call('get', `/safety-data-files/download`, token)
      .query({ name })
      .buffer(true)
      .parse(binaryParser);

  it('el arranque ya no vacía ni rellena la tabla desde una carpeta', async () => {
    expect(await list()).toEqual([]);
  });

  it('un administrador sube, el catálogo la lista y se descarga', async () => {
    const res = await e2e
      .call('post', '/safety-data-files', e2e.tokens.admin)
      .attach('file', pdf('aceite v1'), 'ÁCIDO CÍTRICO.pdf')
      .expect(201);

    expect(res.body).toMatchObject({ name: 'ÁCIDO CÍTRICO.pdf' });
    expect(await list()).toEqual(['ÁCIDO CÍTRICO.pdf']);
    expect(readFileSync(join(dir, 'ÁCIDO CÍTRICO.pdf'))).toEqual(
      pdf('aceite v1'),
    );
    const file = await download('ÁCIDO CÍTRICO.pdf').expect(200);
    expect(file.body).toEqual(pdf('aceite v1'));
    // No quedan restos de la subida.
    expect(readdirSync(join(dir, '.uploads'))).toEqual([]);
  });

  it('el mismo nombre otra vez responde 409 sin tocar el PDF', async () => {
    await e2e
      .call('post', '/safety-data-files', e2e.tokens.admin)
      .attach('file', pdf('otro'), 'ÁCIDO CÍTRICO.pdf')
      .expect(409, /Reemplazar/);

    expect(readFileSync(join(dir, 'ÁCIDO CÍTRICO.pdf'))).toEqual(
      pdf('aceite v1'),
    );
    // El interceptor global borró la subida rechazada.
    expect(readdirSync(join(dir, '.uploads'))).toEqual([]);
  });

  it('un PDF falso responde 400 y no deja archivos', async () => {
    await e2e
      .call('post', '/safety-data-files', e2e.tokens.admin)
      .attach('file', Buffer.from('<script>no</script>'), 'falso.pdf')
      .expect(400, /Solo se permiten archivos PDF/);

    expect(existsSync(join(dir, 'falso.pdf'))).toBe(false);
    expect(readdirSync(join(dir, '.uploads'))).toEqual([]);
  });

  it('un usuario general no puede subir, reemplazar ni eliminar', async () => {
    const [{ id }] = await e2e.dataSource
      .getRepository(SafetyDataFile)
      .find({ where: { name: 'ÁCIDO CÍTRICO.pdf' } });

    await e2e
      .call('post', '/safety-data-files', e2e.tokens.general)
      .attach('file', pdf('x'), 'X.pdf')
      .expect(403);
    await e2e
      .call('put', `/safety-data-files/${id}/file`, e2e.tokens.general)
      .attach('file', pdf('x'), 'X.pdf')
      .expect(403);
    await e2e
      .call('delete', `/safety-data-files/${id}`, e2e.tokens.general)
      .expect(403);
    expect(await list()).toEqual(['ÁCIDO CÍTRICO.pdf']);
  });

  it('reemplazar cambia el PDF y conserva el nombre; eliminar quita registro y archivo', async () => {
    const [{ id }] = await e2e.dataSource
      .getRepository(SafetyDataFile)
      .find({ where: { name: 'ÁCIDO CÍTRICO.pdf' } });

    await e2e
      .call('put', `/safety-data-files/${id}/file`, e2e.tokens.admin)
      .attach('file', pdf('aceite v2'), 'cualquier.pdf')
      .expect(200);
    expect((await download('ÁCIDO CÍTRICO.pdf').expect(200)).body).toEqual(
      pdf('aceite v2'),
    );

    await e2e
      .call('delete', `/safety-data-files/${id}`, e2e.tokens.admin)
      .expect(200);
    expect(await list()).toEqual([]);
    expect(existsSync(join(dir, 'ÁCIDO CÍTRICO.pdf'))).toBe(false);
    await download('ÁCIDO CÍTRICO.pdf').expect(404);
  });
});
