import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  binaryParser,
  createHttpTestApp,
  HttpTestApp,
  mockProvider,
} from '@test/utils';
import { SafetyDataFilesController } from './safety-data-files.controller';
import { SafetyDataFilesService } from './safety-data-files.service';

describe('SafetyDataFilesController (HTTP)', () => {
  let http: HttpTestApp;
  let service: jest.Mocked<SafetyDataFilesService>;
  // Carpeta de HDS temporal con un PDF de prueba.
  const folder = mkdtempSync(join(tmpdir(), 'hds-'));
  writeFileSync(join(folder, 'aceite.pdf'), '%PDF-1.4 prueba');

  beforeAll(async () => {
    http = await createHttpTestApp({
      controllers: [SafetyDataFilesController],
      providers: [
        mockProvider(SafetyDataFilesService, { filePath: folder } as never),
      ],
    });
    service = http.get(SafetyDataFilesService);
  });

  afterAll(async () => {
    await http.close();
    rmSync(folder, { recursive: true, force: true });
  });

  beforeEach(() => jest.clearAllMocks());

  it('GET lista con filtros validados', async () => {
    await http
      .http()
      .get('/safety-data-files')
      .query({ name: 'aceite', order: 'desc', page: 1, limit: 10 })
      .expect(200);

    expect(service.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'aceite', order: 'desc', page: 1 }),
    );
  });

  describe('GET download', () => {
    it('sirve un PDF de la carpeta por su nombre', async () => {
      const res = await http
        .http()
        .get('/safety-data-files/download')
        .query({ name: 'aceite.pdf' })
        .buffer(true)
        .parse(binaryParser)
        .expect(200);

      expect(res.body.toString()).toBe('%PDF-1.4 prueba');
    });

    it.each([
      ['sin nombre', {}],
      ['con una ruta fuera de la carpeta', { name: '../package.json' }],
      ['con una ruta absoluta', { name: join(folder, 'aceite.pdf') }],
      ['con un archivo que no existe', { name: 'otro.pdf' }],
    ])('responde 404 %s', async (_c, query) => {
      await http
        .http()
        .get('/safety-data-files/download')
        .query(query)
        .expect(404);
    });
  });
});
