import { ConflictException, NotFoundException } from '@nestjs/common';
import { FindOperator } from 'typeorm';

import {
  buildUser,
  createServiceTestingModule,
  mockProvider,
  type RepositoryMock,
  runAsUser,
} from '../../test/utils/index.js';
import { AreasService } from '../areas/areas.service.js';
import { ManufacturingPlantsService } from '../manufacturing-plants/manufacturing-plants.service.js';
import { Zone } from './entities/zone.entity.js';
import { ZonesService } from './zones.service.js';

describe('ZonesService', () => {
  let service: ZonesService;
  let zones: RepositoryMock<Zone>;
  let plants: jest.Mocked<ManufacturingPlantsService>;
  let areas: jest.Mocked<AreasService>;
  const user = buildUser({ id: 10 });
  const as = <R>(fn: () => R): Promise<Awaited<R>> =>
    runAsUser(user, fn as () => Promise<Awaited<R>>);

  const stored = () =>
    ({
      id: 7,
      name: 'Pasillo',
      isActive: true,
      manufacturingPlant: { id: 1, name: 'Tepotzotlán' },
      area: { id: 4, name: 'Almacén' },
    }) as unknown as Zone;

  beforeEach(async () => {
    const testing = await createServiceTestingModule(ZonesService, {
      repositories: [Zone],
      providers: [
        mockProvider(ManufacturingPlantsService),
        mockProvider(AreasService),
      ],
    });
    service = testing.service;
    zones = testing.repository(Zone);
    plants = testing.get(ManufacturingPlantsService);
    areas = testing.get(AreasService);

    plants.findOne.mockImplementation(async (id) => ({ id }) as never);
    areas.findOne.mockImplementation(async (id) => ({ id }) as never);
    zones.findOne.mockResolvedValue(stored());
    zones.save.mockImplementation(async (z) => ({ id: 7, ...z }) as never);
    zones.preload.mockImplementation(async (z) => z as never);
  });

  describe('create', () => {
    it('guarda la zona con planta y área validadas', async () => {
      await as(() =>
        service.create({ name: 'Pasillo', manufacturingPlantId: 1, areaId: 4 }),
      );

      expect(zones.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Pasillo',
          manufacturingPlant: { id: 1 },
          area: { id: 4 },
          createdBy: { id: 10 },
        }),
      );
    });

    it('sin área la guarda sin área', async () => {
      await as(() =>
        service.create({ name: 'Patio', manufacturingPlantId: 1 }),
      );

      expect(areas.findOne).not.toHaveBeenCalled();
      expect(zones.create.mock.calls[0][0]).toMatchObject({ area: null });
    });

    it('un nombre repetido en la planta responde 409', async () => {
      zones.save.mockRejectedValue({ code: '23505' });

      await expect(
        as(() => service.create({ name: 'Pasillo', manufacturingPlantId: 1 })),
      ).rejects.toThrow(
        new ConflictException(
          'Ya existe una zona con ese nombre en la planta seleccionada',
        ),
      );
    });

    it('otros errores se propagan', async () => {
      const error = new Error('conexión');
      zones.save.mockRejectedValue(error);

      await expect(
        as(() => service.create({ name: 'Pasillo', manufacturingPlantId: 1 })),
      ).rejects.toBe(error);
    });
  });

  describe('findAll', () => {
    const where = () =>
      zones.find.mock.calls[0][0].where as Record<string, unknown> & {
        manufacturingPlant: { id?: FindOperator<number[]> };
      };

    it('sin filtros: zonas activas de plantas activas', async () => {
      await service.findAll({} as never);

      expect(where()).toEqual({
        isActive: true,
        manufacturingPlant: { isActive: true },
      });
    });

    it('por planta, nombre, solo con área o con un área', async () => {
      await service.findAll({
        manufacturingPlantId: 1,
        name: 'pas',
        areaId: 4,
      } as never);

      expect(where().manufacturingPlant.id.value).toEqual([1]);
      expect((where().name as FindOperator<string>).value).toBe('%pas%');
      expect(where().area).toEqual({ isActive: true, id: 4 });
    });

    it('withArea exige que tenga un área activa', async () => {
      await service.findAll({ withArea: true } as never);

      expect(where().area).toEqual({ isActive: true });
    });

    it('por nombres de planta resuelve sus ids en una consulta', async () => {
      plants.findIdsByNamesOrFail.mockResolvedValue([1, 2]);

      await service.findAll({
        manufacturingPlantNames: ['Tepotzotlán', 'Manizales'],
      } as never);

      expect(where().manufacturingPlant.id.value).toEqual([1, 2]);
    });

    it('view=options: id y nombre con planta y área, sin quién la creó, mismos filtros', async () => {
      await service.findAll({
        manufacturingPlantId: 1,
        withArea: true,
        view: 'options',
      } as never);

      const args = zones.find.mock.calls[0][0] as {
        relations: string[];
        select: unknown;
        order: unknown;
      };
      expect(args.relations).toEqual(['manufacturingPlant', 'area']);
      expect(args.select).toEqual({
        id: true,
        name: true,
        manufacturingPlant: { id: true, name: true },
        area: { id: true, name: true },
      });
      expect(args.order).toEqual({ id: 'DESC' });
      expect(where().manufacturingPlant.id.value).toEqual([1]);
      expect(where().area).toEqual({ isActive: true });
    });

    it('view=options no se pagina aunque lleguen page y limit', async () => {
      await service.findAll({ page: 1, limit: 10, view: 'options' } as never);

      expect(zones.find).toHaveBeenCalled();
      expect(zones.findAndCount).not.toHaveBeenCalled();
    });

    it('con page y limit responde paginado', async () => {
      zones.findAndCount.mockResolvedValue([[], 0]);

      await expect(
        service.findAll({ page: 1, limit: 10 } as never),
      ).resolves.toMatchObject({ count: 0 });
    });
  });

  describe('findOne', () => {
    it('inexistente responde 404 (antes el mensaje decía "Planta")', async () => {
      zones.findOne.mockResolvedValue(null);

      await expect(service.findOne(7)).rejects.toThrow(
        new NotFoundException('Zona con ID 7 no encontrada'),
      );
    });

    it('con isActive=false incluye zonas inactivas', async () => {
      await service.findOne(7, false);

      expect(zones.findOne.mock.calls[0][0].where).toEqual({
        id: 7,
        manufacturingPlant: { isActive: true },
      });
    });
  });

  it('findAllByManufacturingPlantNames separa "Planta - Zona" (con guiones en el nombre)', async () => {
    zones.findOne
      .mockResolvedValueOnce({ id: 1 } as Zone)
      .mockResolvedValueOnce(null);

    await expect(
      service.findAllByManufacturingPlantNames([
        'Tepotzotlán - Pasillo - Norte',
        'Manizales - No existe',
      ]),
    ).resolves.toEqual([{ id: 1 }]);
    expect(zones.findOne.mock.calls[0][0].where).toEqual({
      name: 'Pasillo - Norte',
      isActive: true,
      manufacturingPlant: { name: 'Tepotzotlán', isActive: true },
    });
    await expect(service.findAllByManufacturingPlantNames([])).resolves.toEqual(
      [],
    );
  });

  describe('update', () => {
    it('sin planta ni área conserva las actuales (antes tomaba cualquier planta y quitaba el área)', async () => {
      await as(() => service.update(7, { name: 'Pasillo norte' }));

      expect(plants.findOne).not.toHaveBeenCalled();
      expect(zones.preload).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 7,
          name: 'Pasillo norte',
          manufacturingPlant: { id: 1, name: 'Tepotzotlán' },
          area: { id: 4, name: 'Almacén' },
          updatedBy: { id: 10 },
        }),
      );
    });

    it('areaId null quita el área (como lo manda el UI)', async () => {
      await as(() =>
        service.update(7, { manufacturingPlantId: 2, areaId: null }),
      );

      expect(zones.preload.mock.calls[0][0]).toMatchObject({
        manufacturingPlant: { id: 2 },
        area: null,
      });
    });

    it('con otra área la valida', async () => {
      await as(() => service.update(7, { areaId: 5 }));

      expect(areas.findOne).toHaveBeenCalledWith(5);
    });

    it('un nombre repetido responde 409 y otros errores se propagan', async () => {
      zones.save.mockRejectedValueOnce({ code: '23505' });
      await expect(
        as(() => service.update(7, { name: 'X' })),
      ).rejects.toBeInstanceOf(ConflictException);

      const error = new Error('conexión');
      zones.save.mockRejectedValueOnce(error);
      await expect(as(() => service.update(7, { name: 'X' }))).rejects.toBe(
        error,
      );
    });
  });

  it('remove desactiva la zona', async () => {
    zones.save.mockImplementation(async (z) => z as never);

    await expect(as(() => service.remove(7))).resolves.toMatchObject({
      isActive: false,
      updatedBy: { id: 10 },
    });
  });
});
