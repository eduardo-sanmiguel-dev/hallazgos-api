import {
  BadRequestException,
  ConflictException,
  Controller,
  type ExecutionContext,
  ForbiddenException,
  type INestApplication,
  Logger,
  NotFoundException,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import {
  FileFieldsInterceptor,
  FileInterceptor,
  FilesInterceptor,
} from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { mkdtempSync, readdirSync, rmSync } from 'fs';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import { join } from 'path';
import { lastValueFrom, of, throwError } from 'rxjs';
import request from 'supertest';

import {
  DeleteUploadsOnErrorInterceptor,
  uploadedFiles,
} from './delete-uploads-on-error.interceptor.js';

// unlink real por omisión; cada prueba puede hacerlo fallar.
jest.mock('fs/promises', () => {
  const actual = jest.requireActual('fs/promises');
  return { ...actual, unlink: jest.fn(actual.unlink) };
});
const mockUnlink = jest.requireMock<{ unlink: jest.Mock }>(
  'fs/promises',
).unlink;

// Carpeta temporal propia: las pruebas no tocan public/static.
const folder = mkdtempSync(join(tmpdir(), 'uploads-'));
const storage = diskStorage({
  destination: folder,
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const ERRORS = {
  '400': () => new BadRequestException('Dato inválido'),
  '403': () => new ForbiddenException('Sin permiso'),
  '404': () => new NotFoundException('No existe'),
  '409': () => new ConflictException('Estado no permitido'),
  '500': () => new Error('Falla inesperada'),
};
type Status = keyof typeof ERRORS;

/** Controlador de prueba: cada ruta termina como la pide la prueba. */
@Controller('upload')
class UploadController {
  @Post('ok')
  @UseInterceptors(FileInterceptor('file', { storage }))
  ok(@UploadedFile() file: Express.Multer.File) {
    return { filename: file.filename };
  }

  @Post('fail/:status')
  @UseInterceptors(FileInterceptor('file', { storage }))
  fail(@Param('status') status: Status) {
    throw ERRORS[status]();
  }

  @Post('many')
  @UseInterceptors(FilesInterceptor('files', 3, { storage }))
  many() {
    throw new ConflictException('Estado no permitido');
  }

  @Post('fields')
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'a' }, { name: 'b' }], { storage }),
  )
  fields() {
    throw new NotFoundException('No existe');
  }
}

describe('DeleteUploadsOnErrorInterceptor (HTTP)', () => {
  let app: INestApplication;
  const files = () => readdirSync(folder);
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    // Registrado igual que en AppModule.
    const moduleRef = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [
        { provide: APP_INTERCEPTOR, useClass: DeleteUploadsOnErrorInterceptor },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
    rmSync(folder, { recursive: true, force: true });
  });

  beforeEach(() => {
    for (const name of files()) rmSync(join(folder, name));
  });

  it('si la petición termina bien conserva el archivo', async () => {
    const res = await http()
      .post('/upload/ok')
      .attach('file', png, 'foto.png')
      .expect(201);

    expect(files()).toEqual([res.body.filename]);
  });

  it.each(['400', '403', '404', '409'] as const)(
    'si la petición termina en %s borra el archivo y responde el mismo error',
    async (status) => {
      const res = await http()
        .post(`/upload/fail/${status}`)
        .attach('file', png, 'foto.png')
        .expect(Number(status));

      expect(res.body.message).toBe(ERRORS[status]().message);
      expect(files()).toEqual([]);
    },
  );

  it('ante un error inesperado borra el archivo, responde 500 y registra la excepción', async () => {
    // Este error es deliberado: comprobar su registro sin imprimir un fallo falso.
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    try {
      await http()
        .post('/upload/fail/500')
        .attach('file', png, 'foto.png')
        .expect(500, {
          statusCode: 500,
          message: 'Internal server error',
        });

      expect(files()).toEqual([]);
      expect(logError).toHaveBeenCalledTimes(1);
      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Falla inesperada' }),
      );
    } finally {
      logError.mockRestore();
    }
  });

  it('borra todos los archivos de FilesInterceptor', async () => {
    await http()
      .post('/upload/many')
      .attach('files', png, 'a.png')
      .attach('files', png, 'b.png')
      .expect(409);

    expect(files()).toEqual([]);
  });

  it('borra todos los archivos de FileFieldsInterceptor', async () => {
    await http()
      .post('/upload/fields')
      .attach('a', png, 'a.png')
      .attach('b', png, 'b.png')
      .expect(404);

    expect(files()).toEqual([]);
  });

  it('si no se puede borrar, responde el mismo error y lo registra', async () => {
    mockUnlink.mockRejectedValueOnce(
      Object.assign(new Error('EPERM: ocupado'), { code: 'EPERM' }),
    );
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    const res = await http()
      .post('/upload/fail/403')
      .attach('file', png, 'foto.png')
      .expect(403);

    expect(res.body.message).toBe('Sin permiso');
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('No se pudo borrar la imagen subida'),
    );
    logError.mockRestore();
  });

  it('sin archivo subido el error pasa igual', async () => {
    await http().post('/upload/fail/404').expect(404);
  });
});

describe('DeleteUploadsOnErrorInterceptor (unidad)', () => {
  const interceptor = new DeleteUploadsOnErrorInterceptor();

  it('un archivo que ya no existe (ENOENT) no se registra como error', async () => {
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ file: { path: join(tmpdir(), 'no-existe.png') } }),
      }),
    } as unknown as ExecutionContext;
    const error = new ForbiddenException();

    await expect(
      lastValueFrom(
        interceptor.intercept(context, {
          handle: () => throwError(() => error),
        }),
      ),
    ).rejects.toBe(error);
    expect(logError).not.toHaveBeenCalled();
    logError.mockRestore();
  });

  it('fuera de HTTP (GraphQL) no interviene', async () => {
    const context = { getType: () => 'graphql' } as unknown as ExecutionContext;

    await expect(
      lastValueFrom(interceptor.intercept(context, { handle: () => of('ok') })),
    ).resolves.toBe('ok');
  });

  it('uploadedFiles reúne file, files (lista) y files (por campo), solo con ruta', () => {
    const a = { path: '/tmp/a' } as Express.Multer.File;
    const b = { path: '/tmp/b' } as Express.Multer.File;
    const inMemory = { buffer: Buffer.from('x') } as Express.Multer.File;

    expect(uploadedFiles({ file: a } as never)).toEqual([a]);
    expect(uploadedFiles({ files: [a, inMemory] } as never)).toEqual([a]);
    expect(uploadedFiles({ files: { x: [a], y: [b] } } as never)).toEqual([
      a,
      b,
    ]);
    expect(uploadedFiles({} as never)).toEqual([]);
  });
});
