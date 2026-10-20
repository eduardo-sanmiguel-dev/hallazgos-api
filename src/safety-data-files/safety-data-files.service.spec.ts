import { Logger } from '@nestjs/common';
import { readdirSync } from 'fs';
import { FindOperator } from 'typeorm';

import { createServiceTestingModule, RepositoryMock } from '@test/utils';
import { SafetyDataFile } from './entities/safety-data-file.entity';
import { SafetyDataFilesService } from './safety-data-files.service';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readdirSync: jest.fn(),
}));

describe('SafetyDataFilesService', () => {
  let service: SafetyDataFilesService;
  let files: RepositoryMock<SafetyDataFile>;
  const readdir = readdirSync as unknown as jest.Mock;

  beforeEach(async () => {
    const testing = await createServiceTestingModule(SafetyDataFilesService, {
      repositories: [SafetyDataFile],
    });
    service = testing.service;
    files = testing.repository(SafetyDataFile);
    readdir.mockReset();
  });

  describe('seed (sincroniza la tabla con la carpeta de PDF)', () => {
    it('vacía la tabla e inserta un registro por archivo en una sola consulta', async () => {
      readdir.mockReturnValue(['a.pdf', 'b.pdf']);

      await service.seed();

      expect(files.clear).toHaveBeenCalled();
      expect(files.insert).toHaveBeenCalledWith([
        { name: 'a.pdf' },
        { name: 'b.pdf' },
      ]);
      expect(readdir).toHaveBeenCalledWith(service.filePath);
    });

    it('con la carpeta vacía no inserta', async () => {
      readdir.mockReturnValue([]);

      await service.seed();

      expect(files.insert).not.toHaveBeenCalled();
    });

    it('al iniciar, un error se registra y no detiene la app', async () => {
      readdir.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      const logError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(logError).toHaveBeenCalledWith(
        'No se pudo cargar el catálogo de HDS',
        expect.any(String),
      );
      logError.mockRestore();
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
