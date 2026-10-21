import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FindOperator, In } from 'typeorm';

import {
  buildUser,
  createServiceTestingModule,
  mockProvider,
  type RepositoryMock,
  runAsUser,
} from '../../test/utils/index.js';
import { ManufacturingPlantsService } from '../manufacturing-plants/manufacturing-plants.service.js';
import { GembaWalkZone } from './entities/gemba-walk-zone.entity.js';
import { GembaWalkZonesService } from './gemba-walk-zones.service.js';

describe('GembaWalkZonesService', () => {
  let service: GembaWalkZonesService;
  let zones: RepositoryMock<GembaWalkZone>;
  let plants: jest.Mocked<ManufacturingPlantsService>;
  const user = buildUser({
    id: 10,
    manufacturingPlants: [{ id: 1 }, { id: 2 }] as never,
  });
  const as = <T>(fn: () => Promise<T>) => runAsUser(user, fn);
  const qb = () => zones.queryBuilder;

  const stored = (overrides: Partial<GembaWalkZone> = {}) =>
    ({
      id: 3,
      isActive: true,
      nameZone: 'Producción',
      nameLocation: 'Línea 1',
      manufacturingPlant: { id: 1 },
      ...overrides,
    }) as GembaWalkZone;

  beforeEach(async () => {
    const testing = await createServiceTestingModule(GembaWalkZonesService, {
      repositories: [GembaWalkZone],
      providers: [mockProvider(ManufacturingPlantsService)],
    });
    service = testing.service;
    zones = testing.repository(GembaWalkZone);
    plants = testing.get(ManufacturingPlantsService);
    qb().getOne.mockResolvedValue(null);
    zones.save.mockImplementation(async (z) => ({ id: 3, ...z }) as never);
    zones.preload.mockImplementation(async (z) => z as never);
    zones.findOne.mockResolvedValue(stored());
  });

  describe('create', () => {
    it('guarda la zona con nombres sin espacios sobrantes', async () => {
      await as(() =>
        service.create({
          manufacturingPlantId: 1,
          nameZone: '  Producción ',
          nameLocation: ' Línea 1 ',
        }),
      );

      expect(plants.findOne).toHaveBeenCalledWith(1);
      expect(zones.create).toHaveBeenCalledWith(
        expect.objectContaining({
          nameZone: 'Producción',
          nameLocation: 'Línea 1',
          manufacturingPlant: { id: 1 },
          createdBy: { id: 10 },
        }),
      );
      // La duplicidad se compara sin distinguir mayúsculas.
      expect(qb().where).toHaveBeenCalledWith(
        'LOWER(gembaWalkZone.nameZone) = LOWER(:nameZone)',
        { nameZone: 'Producción' },
      );
    });

    it('nombres con solo espacios responden 400 (antes se guardaban vacíos)', async () => {
      await expect(
        as(() =>
          service.create({
            manufacturingPlantId: 1,
            nameZone: '   ',
            nameLocation: 'Línea 1',
          }),
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'El nombre de la zona y la ubicación son obligatorios',
        ),
      );
      expect(zones.save).not.toHaveBeenCalled();
    });

    it('una zona activa igual en la planta responde 400', async () => {
      qb().getOne.mockResolvedValue(stored());

      await expect(
        as(() =>
          service.create({
            manufacturingPlantId: 1,
            nameZone: 'producción',
            nameLocation: 'línea 1',
          }),
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'Ya existe una zona activa con ese nombre y ubicación en la planta seleccionada',
        ),
      );
    });
  });

  describe('findAll', () => {
    it('filtra por nombre, ubicación y planta (activas)', async () => {
      await as(async () =>
        service.findAll({
          nameZone: 'Prod',
          nameLocation: 'L',
          manufacturingPlantId: 1,
        }),
      );

      const { where } = zones.find.mock.calls[0][0] as {
        where: Record<string, FindOperator<string> | object>;
      };
      expect((where.nameZone as FindOperator<string>).value).toBe('%Prod%');
      expect((where.nameLocation as FindOperator<string>).value).toBe('%L%');
      expect(where.manufacturingPlant).toEqual({ isActive: true, id: In([1]) });
    });

    it('con page y limit responde paginado', async () => {
      zones.findAndCount.mockResolvedValue([[stored()], 1]);

      await expect(
        as(async () => service.findAll({ page: 1, limit: 5 })),
      ).resolves.toMatchObject({
        count: 1,
      });
    });
  });

  describe('findOne', () => {
    it('inexistente responde 404', async () => {
      zones.findOne.mockResolvedValue(null);

      await expect(as(async () => service.findOne(3))).rejects.toThrow(
        new NotFoundException('Zona con ID 3 no encontrada'),
      );
    });

    it('inactiva responde 400 (salvo que se pida incluirla)', async () => {
      zones.findOne.mockResolvedValue(stored({ isActive: false }));

      await expect(as(async () => service.findOne(3))).rejects.toThrow(
        new BadRequestException('La zona con ID 3 esta inactiva'),
      );
      await expect(
        as(async () => service.findOne(3, false)),
      ).resolves.toMatchObject({ id: 3 });
    });
  });

  describe('update', () => {
    it('conserva lo no enviado y excluye la propia zona al validar duplicados', async () => {
      await as(() => service.update(3, { nameLocation: ' Línea 2 ' }));

      expect(zones.preload).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 3,
          nameZone: 'Producción',
          nameLocation: 'Línea 2',
          manufacturingPlant: { id: 1 },
          updatedBy: { id: 10 },
        }),
      );
      expect(qb().andWhere).toHaveBeenCalledWith(
        'gembaWalkZone.id <> :excludeId',
        {
          excludeId: 3,
        },
      );
    });

    it('puede cambiar de planta (validando que exista)', async () => {
      await as(() => service.update(3, { manufacturingPlantId: 2 }));

      expect(plants.findOne).toHaveBeenCalledWith(2);
    });
  });

  it('remove desactiva la zona', async () => {
    zones.save.mockImplementation(async (z) => z as never);

    await expect(as(() => service.remove(3))).resolves.toMatchObject({
      isActive: false,
      updatedBy: { id: 10 },
    });
  });
});
