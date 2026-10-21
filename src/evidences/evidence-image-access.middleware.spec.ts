import { Logger } from '@nestjs/common';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  EvidenceImageAccessMiddleware,
  registerEvidenceImageAccess,
} from './evidence-image-access.middleware';
import { Evidence } from './entities/evidence.entity';
describe('EvidenceImageAccessMiddleware', () => {
  let middleware: EvidenceImageAccessMiddleware;
  let temp: string;
  let jwt: any,
    users: any,
    repository: any,
    ics: any,
    db: any,
    req: any,
    res: any,
    next: jest.Mock;
  beforeEach(() => {
    temp = mkdtempSync(join(tmpdir(), 'hallazgos-images-'));
    mkdirSync(join(temp, 'public/static/images/evidences'), {
      recursive: true,
    });
    writeFileSync(
      join(temp, 'public/static/images/evidences/photo.png'),
      'image',
    );
    jest.spyOn(process, 'cwd').mockReturnValue(temp);
    jwt = { verify: jest.fn().mockReturnValue({ userId: 1 }) };
    users = {
      findOne: jest
        .fn()
        .mockResolvedValue({ manufacturingPlants: [{ id: 1 }] }),
    };
    repository = { exists: jest.fn().mockResolvedValue(true) };
    ics = { exists: jest.fn().mockResolvedValue(false) };
    db = {
      getRepository: jest.fn((entity) =>
        entity === Evidence ? repository : ics,
      ),
    };
    middleware = new EvidenceImageAccessMiddleware(jwt, users, db);
    req = {
      path: '/static/images/evidences/photo.png',
      cookies: { token: 'session' },
      headers: {},
    };
    res = {
      setHeader: jest.fn(),
      vary: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      sendFile: jest.fn(),
    };
    next = jest.fn();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(temp, { recursive: true, force: true });
  });
  it('permite una imagen autorizada con caché privada', async () => {
    await middleware.use(req, res, next);
    expect(res.sendFile).toHaveBeenCalledTimes(1);
    expect(jwt.verify).toHaveBeenCalledWith('session');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store',
    );
    const options = repository.exists.mock.calls[0][0];
    expect(options.where.map((w) => w.manufacturingPlant.id.value)).toEqual([
      [1],
      [1],
      [1],
    ]);
  });
  it('acepta Authorization y conserva la protección sin plantas', async () => {
    req.cookies = {};
    req.headers.authorization = 'Bearer bearer';
    users.findOne.mockResolvedValue({ manufacturingPlants: [] });
    repository.exists.mockResolvedValue(false);
    await middleware.use(req, res, next);
    expect(jwt.verify).toHaveBeenCalledWith('bearer');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });
  it('permite imágenes de ICS de las plantas autorizadas', async () => {
    repository.exists.mockResolvedValue(false);
    ics.exists.mockResolvedValue(true);
    await middleware.use(req, res, next);
    expect(res.sendFile).toHaveBeenCalled();
    expect(
      ics.exists.mock.calls[0][0].where.manufacturingPlant.id.value,
    ).toEqual([1]);
  });
  it.each(['jwt', 'user'])('rechaza una sesión inválida: %s', async (where) => {
    if (where === 'jwt')
      jwt.verify.mockImplementation(() => {
        throw Error('invalid');
      });
    else users.findOne.mockRejectedValue(Error('disabled'));
    await middleware.use(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(db.getRepository).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
  it('rechaza una petición sin credenciales', async () => {
    req.cookies = undefined;
    jwt.verify.mockImplementation(() => {
      throw Error('empty');
    });
    await middleware.use(req, res, next);
    expect(jwt.verify).toHaveBeenCalledWith('');
    expect(res.status).toHaveBeenCalledWith(401);
  });
  it.each([
    '/..%2Fsecret.png',
    '/%ZZ',
    '/photo.txt',
    '/nested/photo.png',
    '/%00.png',
  ])('rechaza un nombre inseguro %s', async (filename) => {
    req.path = '/static/images/evidences' + filename;
    await middleware.use(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.getRepository).not.toHaveBeenCalled();
  });
  it('no entrega un archivo inexistente aunque tenga registro', async () => {
    req.path = '/static/images/evidences/absent.png';
    await middleware.use(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });
  it('no continúa ante un fallo de base de datos', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    repository.exists.mockRejectedValue(Error('db unavailable'));
    await middleware.use(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
  });
  it('deja pasar rutas que no son imágenes privadas', async () => {
    req.path = '/api/v1/health';
    await middleware.use(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(jwt.verify).not.toHaveBeenCalled();
  });
  it('normaliza separadores repetidos antes de autorizar', async () => {
    req.path = '/static//images/evidences/photo.png';
    await middleware.use(req, res, next);
    expect(res.sendFile).toHaveBeenCalledTimes(1);
  });
  it('responde 404 si el archivo desaparece al enviarlo', async () => {
    res.sendFile.mockImplementation((_file, _options, callback) =>
      callback(Error('ENOENT')),
    );
    await middleware.use(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it('registra la protección en la ruta estática actual', () => {
    const app = { get: jest.fn().mockReturnValue(middleware), use: jest.fn() };
    registerEvidenceImageAccess(app);
    expect(app.use).toHaveBeenCalledWith(expect.any(Function));
  });
});
