import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FindOperator } from 'typeorm';

import {
  buildUser,
  createServiceTestingModule,
  mockProvider,
  RepositoryMock,
  runAsUser,
} from '@test/utils';
import { GembaWalkZonesService } from 'gemba-walk-zones/gemba-walk-zones.service';
import { ManufacturingPlantsService } from 'manufacturing-plants/manufacturing-plants.service';
import { User } from 'users/entities/user.entity';
import { GembaWalkObserver } from './entities/gemba-walk-observer.entity';
import { GembaWalkObserversService } from './gemba-walk-observers.service';

describe('GembaWalkObserversService', () => {
  let service: GembaWalkObserversService;
  let observers: RepositoryMock<GembaWalkObserver>;
  let users: RepositoryMock<User>;
  let zones: jest.Mocked<GembaWalkZonesService>;
  const admin = buildUser({ id: 10 });
  const as = <T>(fn: () => Promise<T>) => runAsUser(admin, fn);

  const inPlant = (id: number, name = `Usuario ${id}`, plantId = 1) =>
    ({ id, name, manufacturingPlants: [{ id: plantId }] }) as User;

  const stored = (overrides: Partial<GembaWalkObserver> = {}) =>
    ({
      id: 8,
      isActive: true,
      manufacturingPlant: { id: 1 },
      gembaWalkZone: { id: 3 },
      user: { id: 20 },
      ...overrides,
    }) as GembaWalkObserver;

  beforeEach(async () => {
    const testing = await createServiceTestingModule(
      GembaWalkObserversService,
      {
        repositories: [GembaWalkObserver, User],
        providers: [
          mockProvider(ManufacturingPlantsService),
          mockProvider(GembaWalkZonesService),
        ],
      },
    );
    service = testing.service;
    observers = testing.repository(GembaWalkObserver);
    users = testing.repository(User);
    zones = testing.get(GembaWalkZonesService);

    zones.findOne.mockResolvedValue({
      id: 3,
      manufacturingPlant: { id: 1 },
    } as never);
    users.find.mockImplementation(async ({ where }) =>
      (
        (where as unknown as { id: FindOperator<number[]> }).id
          .value as number[]
      ).map((id) => inPlant(id)),
    );
    observers.find.mockResolvedValue([]);
    observers.save.mockImplementation(
      async (rows) =>
        (rows as GembaWalkObserver[]).map((row, i) => ({
          id: 100 + i,
          ...row,
        })) as never,
    );
  });

  describe('create', () => {
    const create = (userIds: number[], gembaWalkZoneId = 3) =>
      as(() =>
        service.create({ manufacturingPlantId: 1, gembaWalkZoneId, userIds }),
      );

    it('registra un observador por usuario', async () => {
      await create([20, 21]);

      expect(observers.create).toHaveBeenCalledTimes(2);
      expect(observers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          manufacturingPlant: { id: 1 },
          gembaWalkZone: { id: 3 },
          user: { id: 21 },
          createdBy: { id: 10 },
        }),
      );
      const lastFind = observers.find.mock.calls.at(-1)[0] as unknown as {
        where: { id: FindOperator<number[]> };
      };
      expect(lastFind.where.id.value).toEqual([100, 101]);
    });

    it('una zona de otra planta responde 400', async () => {
      zones.findOne.mockResolvedValue({
        id: 3,
        manufacturingPlant: { id: 2 },
      } as never);

      await expect(create([20])).rejects.toThrow(
        new BadRequestException(
          'La zona seleccionada no pertenece a la planta seleccionada',
        ),
      );
    });

    it('un usuario inexistente o inactivo responde 404', async () => {
      users.find.mockResolvedValue([inPlant(20)]);

      await expect(create([20, 21])).rejects.toThrow(
        new NotFoundException('Usuario(s) con ID 21 no encontrado(s)'),
      );
    });

    it('un usuario de otra planta responde 400 con su nombre', async () => {
      users.find.mockResolvedValue([inPlant(20, 'Ana', 2)]);

      await expect(create([20])).rejects.toThrow(
        new BadRequestException(
          'Los siguientes usuarios no pertenecen a la planta seleccionada: Ana',
        ),
      );
    });

    it('un usuario que ya observa la zona responde 400', async () => {
      observers.find.mockResolvedValueOnce([
        stored({ user: { name: 'Ana' } as User }),
      ]);

      await expect(create([20])).rejects.toThrow(
        new BadRequestException(
          'Los siguientes usuarios ya son observadores activos en la zona seleccionada: Ana',
        ),
      );
      expect(observers.save).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('filtra por planta, zona y nombre de usuario', async () => {
      await service.findAll({
        manufacturingPlantId: 1,
        gembaWalkZoneId: 3,
        userName: 'ana',
      });

      const { where } = observers.find.mock.calls[0][0] as {
        where: Record<string, unknown> & {
          user: { name: FindOperator<string> };
        };
      };
      expect(where).toMatchObject({
        isActive: true,
        manufacturingPlant: { isActive: true, id: 1 },
        gembaWalkZone: { id: 3 },
      });
      expect(where.user.name.value).toBe('%ana%');
    });

    it('con page y limit responde paginado', async () => {
      observers.findAndCount.mockResolvedValue([[stored()], 1]);

      await expect(
        service.findAll({ page: 1, limit: 5 }),
      ).resolves.toMatchObject({
        count: 1,
      });
    });
  });

  describe('findOne', () => {
    it('inexistente responde 404', async () => {
      await expect(service.findOne(8)).rejects.toThrow(
        new NotFoundException('Observador con ID 8 no encontrado'),
      );
    });

    it('inactivo responde 400 (salvo que se pida incluirlo)', async () => {
      observers.findOne.mockResolvedValue(stored({ isActive: false }));

      await expect(service.findOne(8)).rejects.toThrow(
        new BadRequestException('El observador con ID 8 esta inactivo'),
      );
      await expect(service.findOne(8, false)).resolves.toMatchObject({ id: 8 });
    });
  });

  describe('update', () => {
    beforeEach(() => {
      observers.findOne.mockResolvedValue(stored());
      observers.preload.mockImplementation(async (row) => row as never);
      observers.save.mockImplementation(async (row) => row as never);
    });

    it('conserva lo no enviado y se excluye a sí mismo al validar', async () => {
      await as(() => service.update(8, { userId: 21 }));

      expect(observers.preload).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 8,
          manufacturingPlant: { id: 1 },
          gembaWalkZone: { id: 3 },
          user: { id: 21 },
          updatedBy: { id: 10 },
        }),
      );
      const duplicates = observers.find.mock.calls[0][0] as {
        where: { id: FindOperator<number> };
      };
      expect(duplicates.where.id.type).toBe('not');
      expect(duplicates.where.id.value).toBe(8);
    });

    it('si el registro no tiene usuario y no se envía responde 400', async () => {
      observers.findOne.mockResolvedValue(stored({ user: null }));

      await expect(as(() => service.update(8, {}))).rejects.toThrow(
        new BadRequestException('El usuario es requerido'),
      );
    });
  });

  it('remove desactiva el observador', async () => {
    observers.findOne.mockResolvedValue(stored());
    observers.save.mockImplementation(async (row) => row as never);

    await expect(as(() => service.remove(8))).resolves.toMatchObject({
      isActive: false,
      updatedBy: { id: 10 },
    });
  });
});
