import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  binaryParser,
  buildAdmin,
  buildUser,
  createHttpTestApp,
  type HttpTestApp,
  mockProvider,
} from '../../test/utils/index.js';
import { SafetyDataFilesController } from './safety-data-files.controller.js';
import { SafetyDataFilesService } from './safety-data-files.service.js';

const PDF = Buffer.from('%PDF-1.4 prueba');

describe('SafetyDataFilesController (HTTP)', () => {
  let http: HttpTestApp;
  let service: jest.Mocked<SafetyDataFilesService>;
  // Carpeta de HDS temporal con un PDF de prueba (también recibe las subidas).
  const folder = mkdtempSync(join(tmpdir(), 'hds-'));
  writeFileSync(join(folder, 'aceite.pdf'), PDF);
  const previousDir = process.env.HDS_DIR;
  const uploadsLeft = () =>
    existsSync(join(folder, '.uploads'))
      ? readdirSync(join(folder, '.uploads'))
      : [];

  beforeAll(async () => {
    process.env.HDS_DIR = folder;
    http = await createHttpTestApp({
      controllers: [SafetyDataFilesController],
      providers: [
        mockProvider(SafetyDataFilesService, { filePath: folder } as never),
      ],
      user: buildAdmin(),
    });
    service = http.get(SafetyDataFilesService);
  });

  afterAll(async () => {
    await http.close();
    rmSync(folder, { recursive: true, force: true });
    if (previousDir === undefined) delete process.env.HDS_DIR;
    else process.env.HDS_DIR = previousDir;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Con el servicio simulado nadie mueve las subidas: se limpian aquí.
    rmSync(join(folder, '.uploads'), { recursive: true, force: true });
    http.setUser(buildAdmin());
    service.findActiveByName.mockResolvedValue({ id: 1 } as never);
  });

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
    it('sirve un PDF del catálogo por su nombre', async () => {
      const res = await http
        .http()
        .get('/safety-data-files/download')
        .query({ name: 'aceite.pdf' })
        .buffer(true)
        .parse(binaryParser)
        .expect(200);

      expect(res.body.toString()).toBe('%PDF-1.4 prueba');
      expect(service.findActiveByName).toHaveBeenCalledWith('aceite.pdf');
    });

    it('404 si el archivo existe pero no está en el catálogo', async () => {
      service.findActiveByName.mockResolvedValue(null);

      await http
        .http()
        .get('/safety-data-files/download')
        .query({ name: 'aceite.pdf' })
        .expect(404);
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

  describe('POST (subir)', () => {
    it('recibe el PDF en el campo file y lo pasa al servicio', async () => {
      service.upload.mockResolvedValue({ id: 5, name: 'NUEVA.pdf' } as never);

      const res = await http
        .http()
        .post('/safety-data-files')
        .attach('file', PDF, 'NUEVA.pdf')
        .expect(201);

      expect(res.body).toEqual({ id: 5, name: 'NUEVA.pdf' });
      const [file] = service.upload.mock.calls[0];
      expect(file.originalname).toBe('NUEVA.pdf');
      expect(file.path).toContain('.uploads');
    });

    it('un archivo que no es PDF (aunque se llame .pdf) responde 400 y no queda guardado', async () => {
      await http
        .http()
        .post('/safety-data-files')
        .attach('file', Buffer.from('<html>no</html>'), 'falso.pdf')
        .expect(400, /Solo se permiten archivos PDF/);

      expect(service.upload).not.toHaveBeenCalled();
      expect(uploadsLeft()).toEqual([]);
    });

    it('una extensión que no es .pdf responde 400', async () => {
      await http
        .http()
        .post('/safety-data-files')
        .attach('file', PDF, 'hoja.docx')
        .expect(400);

      expect(service.upload).not.toHaveBeenCalled();
    });

    it('sin archivo responde 400', async () => {
      await http
        .http()
        .post('/safety-data-files')
        .expect(400, /Adjunta el archivo PDF/);
    });

    it('un usuario que no es administrador recibe 403', async () => {
      http.setUser(buildUser());

      await http
        .http()
        .post('/safety-data-files')
        .attach('file', PDF, 'NUEVA.pdf')
        .expect(403);

      expect(service.upload).not.toHaveBeenCalled();
    });
  });

  describe('PUT :id/file (reemplazar)', () => {
    it('pasa el id numérico y el PDF al servicio', async () => {
      service.replace.mockResolvedValue({ id: 3, name: 'aceite.pdf' } as never);

      await http
        .http()
        .put('/safety-data-files/3/file')
        .attach('file', PDF, 'version-nueva.pdf')
        .expect(200);

      expect(service.replace).toHaveBeenCalledWith(
        3,
        expect.objectContaining({ originalname: 'version-nueva.pdf' }),
      );
    });

    it('un id no numérico responde 400', async () => {
      await http
        .http()
        .put('/safety-data-files/abc/file')
        .attach('file', PDF, 'x.pdf')
        .expect(400);
    });
  });

  describe('DELETE :id', () => {
    it('elimina por id', async () => {
      service.remove.mockResolvedValue({ id: 3, name: 'aceite.pdf' } as never);

      await http.http().delete('/safety-data-files/3').expect(200);

      expect(service.remove).toHaveBeenCalledWith(3);
    });

    it('un usuario que no es administrador recibe 403', async () => {
      http.setUser(buildUser());

      await http.http().delete('/safety-data-files/3').expect(403);

      expect(service.remove).not.toHaveBeenCalled();
    });
  });
});
