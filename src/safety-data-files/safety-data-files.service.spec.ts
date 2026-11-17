import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FindOperator } from 'typeorm';

import {
  createServiceTestingModule,
  type RepositoryMock,
} from '../../test/utils/index.js';
import { SafetyDataFile } from './entities/safety-data-file.entity.js';
import { SafetyDataFilesService } from './safety-data-files.service.js';

describe('SafetyDataFilesService', () => {
  let service: SafetyDataFilesService;
  let files: RepositoryMock<SafetyDataFile>;
  // Carpeta de HDS temporal y real: se prueba que los PDF se mueven y borran.
  let dir: string;
  const previousDir = process.env.HDS_DIR;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'hds-service-'));
    process.env.HDS_DIR = dir;
    const testing = await createServiceTestingModule(SafetyDataFilesService, {
      repositories: [SafetyDataFile],
    });
    service = testing.service;
    files = testing.repository(SafetyDataFile);
    files.create.mockImplementation((data) => data as SafetyDataFile);
    files.save.mockImplementation(
      async (data) => ({ id: 7, ...data }) as never,
    );
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (previousDir === undefined) delete process.env.HDS_DIR;
    else process.env.HDS_DIR = previousDir;
  });

  /** Archivo como lo deja multer: en .uploads con nombre aleatorio. */
  const uploaded = (originalname: string, content = '%PDF-1.4 nuevo') => {
    const uploads = join(dir, '.uploads');
    mkdirSync(uploads, { recursive: true });
    const path = join(uploads, `${Math.random().toString(36).slice(2)}.pdf`);
    writeFileSync(path, content);
    return { originalname, path } as Express.Multer.File;
  };

  it('la carpeta de los PDF sale de HDS_DIR', () => {
    expect(service.filePath).toBe(dir);
  });

  describe('upload', () => {
    it('mueve el PDF a la carpeta con el nombre del archivo y lo registra', async () => {
      files.exists.mockResolvedValue(false);
      const file = uploaded('ACEITE.pdf');

      await expect(service.upload(file)).resolves.toMatchObject({
        id: 7,
        name: 'ACEITE.pdf',
      });
      expect(readFileSync(join(dir, 'ACEITE.pdf'), 'utf8')).toBe(
        '%PDF-1.4 nuevo',
      );
      expect(existsSync(file.path)).toBe(false);
      expect(files.save).toHaveBeenCalledWith({ name: 'ACEITE.pdf' });
    });

    it('conserva acentos y ñ (multer entrega el nombre en latin1)', async () => {
      files.exists.mockResolvedValue(false);
      const latin1 = Buffer.from('ÁCIDO PEÑA.pdf', 'utf8').toString('latin1');

      await service.upload(uploaded(latin1));

      expect(existsSync(join(dir, 'ÁCIDO PEÑA.pdf'))).toBe(true);
      expect(files.save).toHaveBeenCalledWith({ name: 'ÁCIDO PEÑA.pdf' });
    });

    it('si ya existe una HDS con ese nombre responde 409 y no toca el PDF actual', async () => {
      writeFileSync(join(dir, 'ACEITE.pdf'), '%PDF-1.4 actual');
      files.exists.mockResolvedValue(true);

      await expect(service.upload(uploaded('ACEITE.pdf'))).rejects.toThrow(
        ConflictException,
      );
      expect(readFileSync(join(dir, 'ACEITE.pdf'), 'utf8')).toBe(
        '%PDF-1.4 actual',
      );
      expect(files.save).not.toHaveBeenCalled();
    });

    it('si otra subida ganó la carrera (unique), borra el PDF y responde 409', async () => {
      files.exists.mockResolvedValue(false);
      files.save.mockRejectedValue(
        Object.assign(new Error('dup'), { code: '23505' }),
      );

      await expect(service.upload(uploaded('ACEITE.pdf'))).rejects.toThrow(
        ConflictException,
      );
      expect(existsSync(join(dir, 'ACEITE.pdf'))).toBe(false);
    });

    it.each([
      ['sin extensión pdf', 'notas.txt'],
      ['solo extensión', '.pdf'],
    ])('rechaza un nombre no válido (%s)', async (_c, name) => {
      await expect(service.upload(uploaded(name))).rejects.toThrow(
        'El nombre del archivo no es válido',
      );
    });

    it('un nombre con carpetas se queda solo con el nombre del archivo', async () => {
      files.exists.mockResolvedValue(false);

      await service.upload(uploaded('../../etc/ACEITE.pdf'));

      expect(existsSync(join(dir, 'ACEITE.pdf'))).toBe(true);
    });
  });

  describe('replace', () => {
    it('cambia el PDF y conserva el nombre del catálogo', async () => {
      writeFileSync(join(dir, 'ACEITE.pdf'), '%PDF-1.4 viejo');
      files.findOne.mockResolvedValue({ id: 3, name: 'ACEITE.pdf' } as never);

      await service.replace(
        3,
        uploaded('cualquier-nombre.pdf', '%PDF-1.7 nuevo'),
      );

      expect(readFileSync(join(dir, 'ACEITE.pdf'), 'utf8')).toBe(
        '%PDF-1.7 nuevo',
      );
      expect(files.update).toHaveBeenCalledWith(3, { name: 'ACEITE.pdf' });
    });

    it('404 si la HDS no existe o está inactiva', async () => {
      files.findOne.mockResolvedValue(null);

      await expect(service.replace(9, uploaded('x.pdf'))).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('borra el registro y su PDF', async () => {
      writeFileSync(join(dir, 'ACEITE.pdf'), '%PDF-1.4');
      files.findOne.mockResolvedValue({ id: 3, name: 'ACEITE.pdf' } as never);

      await expect(service.remove(3)).resolves.toEqual({
        id: 3,
        name: 'ACEITE.pdf',
      });
      expect(files.delete).toHaveBeenCalledWith(3);
      expect(existsSync(join(dir, 'ACEITE.pdf'))).toBe(false);
    });

    it('si el PDF ya no estaba, igual quita el registro', async () => {
      files.findOne.mockResolvedValue({ id: 3, name: 'ACEITE.pdf' } as never);

      await expect(service.remove(3)).resolves.toMatchObject({ id: 3 });
      expect(files.delete).toHaveBeenCalledWith(3);
    });

    it('un nombre guardado con carpetas no puede borrar fuera de la carpeta', async () => {
      files.findOne.mockResolvedValue({ id: 3, name: '../fuera.pdf' } as never);
      writeFileSync(join(dir, '..', 'fuera-hds-test.pdf'), 'x');

      await expect(service.remove(3)).resolves.toBeDefined();
      expect(existsSync(join(dir, '..', 'fuera-hds-test.pdf'))).toBe(true);
      rmSync(join(dir, '..', 'fuera-hds-test.pdf'));
    });
  });

  describe('findAll', () => {
    it('busca por nombre y ordena descendente si se pide', async () => {
      await service.findAll({ name: ' aceite ', order: 'desc' });

      const { where, order } = files.find.mock.calls[0][0] as {
        where: { isActive: boolean; name: FindOperator<string> };
        order: object;
      };
      expect(where.isActive).toBe(true);
      expect(where.name.value).toBe('%aceite%');
      expect(order).toEqual({ name: 'DESC' });
    });

    it('sin búsqueda ordena ascendente', async () => {
      await service.findAll({});

      const { where, order } = files.find.mock.calls[0][0] as {
        where: object;
        order: object;
      };
      expect(where).toEqual({ isActive: true });
      expect(order).toEqual({ name: 'ASC' });
    });

    it('paginado aplica skip/take; limit -1 trae todo', async () => {
      files.findAndCount.mockResolvedValue([[], 3]);

      await expect(service.findAll({ page: 2, limit: 10 })).resolves.toEqual({
        data: [],
        count: 3,
      });
      await service.findAll({ page: 1, limit: -1 });

      expect(files.findAndCount.mock.calls[0][0]).toMatchObject({
        take: 10,
        skip: 10,
      });
      expect(files.findAndCount.mock.calls[1][0]).not.toHaveProperty('take');
    });
  });
});
