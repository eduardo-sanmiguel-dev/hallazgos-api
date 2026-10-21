import { NotFoundException } from '@nestjs/common';
import { FindOperator } from 'typeorm';

import {
  createServiceTestingModule,
  mockProvider,
  type RepositoryMock,
} from '../../test/utils/index.js';
import { ManufacturingPlantsService } from '../manufacturing-plants/manufacturing-plants.service.js';
import { Processes } from './entities/processes.entity.js';
import { ProcessesService } from './processes.service.js';

describe('ProcessesService', () => {
  let service: ProcessesService;
  let processes: RepositoryMock<Processes>;
  let plants: jest.Mocked<ManufacturingPlantsService>;

  const stored = () =>
    ({
      id: 3,
      name: 'Producción',
      isActive: true,
      manufacturingPlant: { id: 1, name: 'Tepotzotlán' },
    }) as unknown as Processes;

  beforeEach(async () => {
    const testing = await createServiceTestingModule(ProcessesService, {
      repositories: [Processes],
      providers: [mockProvider(ManufacturingPlantsService)],
    });
    service = testing.service;
    processes = testing.repository(Processes);
    plants = testing.get(ManufacturingPlantsService);
    plants.findOne.mockImplementation(async (id) => ({ id }) as never);
    processes.findOne.mockResolvedValue(stored());
    processes.preload.mockImplementation(async (p) => p as never);
  });

  it('create guarda el proceso con su planta validada', async () => {
    await service.create({ name: 'Calidad', manufacturingPlantId: 1 });

    expect(plants.findOne).toHaveBeenCalledWith(1);
    expect(processes.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Calidad',
        manufacturingPlant: { id: 1 },
      }),
    );
  });

  describe('findAll', () => {
    const where = () =>
      processes.find.mock.calls[0][0].where as Record<string, unknown> & {
        manufacturingPlant: { id?: FindOperator<number[]> };
      };

    it('sin filtros: activos de plantas activas', async () => {
      await service.findAll({} as never);

      expect(where()).toEqual({
        isActive: true,
        manufacturingPlant: { isActive: true },
      });
    });

    it('por planta y nombre', async () => {
      await service.findAll({ manufacturingPlantId: 2, name: 'cal' } as never);

      expect(where().manufacturingPlant.id.value).toEqual([2]);
      expect((where().name as FindOperator<string>).value).toBe('%cal%');
    });

    it('por nombres de planta', async () => {
      plants.findIdsByNamesOrFail.mockResolvedValue([1, 2]);

      await service.findAll({ manufacturingPlantNames: ['A', 'B'] } as never);

      expect(where().manufacturingPlant.id.value).toEqual([1, 2]);
    });

    it('paginado si se pide', async () => {
      processes.findAndCount.mockResolvedValue([[], 0]);

      await expect(
        service.findAll({ page: 1, limit: 5 } as never),
      ).resolves.toMatchObject({ count: 0 });
    });
  });

  describe('findOne', () => {
    it('inexistente responde 404 (antes el mensaje decía "Planta")', async () => {
      processes.findOne.mockResolvedValue(null);

      await expect(service.findOne(3)).rejects.toThrow(
        new NotFoundException('Proceso con ID 3 no encontrado'),
      );
    });

    it('con isActive=false incluye inactivos', async () => {
      await service.findOne(3, false);

      expect(processes.findOne.mock.calls[0][0].where).toEqual({
        id: 3,
        manufacturingPlant: { isActive: true },
      });
    });
  });

  describe('findAllByManufacturingPlantNames', () => {
    it('busca cada "Planta - Proceso" (aunque el proceso tenga guiones)', async () => {
      processes.findOne
        .mockResolvedValueOnce(stored())
        .mockResolvedValueOnce(null);

      await expect(
        service.findAllByManufacturingPlantNames([
          'Tepotzotlán - Producción - Turno 1',
          'Manizales - No existe',
        ]),
      ).resolves.toEqual([stored()]);
      expect(processes.findOne.mock.calls[0][0].where).toEqual({
        name: 'Producción - Turno 1',
        isActive: true,
        manufacturingPlant: { name: 'Tepotzotlán', isActive: true },
      });
    });

    it('sin nombres devuelve vacío (antes respondía 500 con undefined)', async () => {
      await expect(
        service.findAllByManufacturingPlantNames(undefined),
      ).resolves.toEqual([]);
    });
  });

  describe('update', () => {
    it('sin planta conserva la actual (antes tomaba cualquier planta)', async () => {
      await service.update(3, { name: 'Producción 2' });

      expect(plants.findOne).not.toHaveBeenCalled();
      expect(processes.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 3,
          name: 'Producción 2',
          manufacturingPlant: { id: 1, name: 'Tepotzotlán' },
        }),
      );
    });

    it('con planta la valida', async () => {
      await service.update(3, { manufacturingPlantId: 2 });

      expect(plants.findOne).toHaveBeenCalledWith(2);
    });
  });

  it('remove desactiva y devuelve el proceso', async () => {
    await service.remove(3);

    expect(processes.update).toHaveBeenCalledWith(3, { isActive: false });
  });
});
