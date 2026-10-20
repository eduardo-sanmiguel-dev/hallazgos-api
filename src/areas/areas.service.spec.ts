import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FindOperator } from 'typeorm';

import {
  buildUser,
  createServiceTestingModule,
  mockProvider,
  RepositoryMock,
  runAsUser,
} from '@test/utils';
import { ManufacturingPlantsService } from 'manufacturing-plants/manufacturing-plants.service';
import { Area } from './entities/area.entity';
import { AreasService } from './areas.service';

describe('AreasService', () => {
  let service: AreasService;
  let areas: RepositoryMock<Area>;
  let plants: jest.Mocked<ManufacturingPlantsService>;
  const user = buildUser({ id: 10 });
  const as = <R>(fn: () => R): Promise<Awaited<R>> =>
    runAsUser(user, fn as () => Promise<Awaited<R>>);
  const qb = () => areas.queryBuilder;

  const stored = (overrides: Partial<Area> = {}) =>
    ({
      id: 4,
      name: 'Almacén',
      isActive: true,
      manufacturingPlant: { id: 1 },
      ...overrides,
    }) as Area;

  beforeEach(async () => {
    const testing = await createServiceTestingModule(AreasService, {
      repositories: [Area],
      providers: [mockProvider(ManufacturingPlantsService)],
    });
    service = testing.service;
    areas = testing.repository(Area);
    plants = testing.get(ManufacturingPlantsService);
    qb().getOne.mockResolvedValue(null);
    areas.save.mockImplementation(async (a) => ({ id: 4, ...a }) as never);
    areas.preload.mockImplementation(async (a) => a as never);
    areas.findOne.mockResolvedValue(stored());
  });

  describe('create', () => {
    const dto = {
      name: ' Almacén ',
      manufacturingPlantId: 1,
      coordinateX: 10,
      coordinateY: 20,
      zoomLevel: 1.5,
    };

    it('guarda el área (nombre sin espacios sobrantes) con sus coordenadas', async () => {
      await as(() => service.create(dto));

      expect(plants.findOne).toHaveBeenCalledWith(1);
      expect(areas.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Almacén',
          coordinateX: 10,
          coordinateY: 20,
          zoomLevel: 1.5,
          manufacturingPlant: { id: 1 },
          createdBy: { id: 10 },
        }),
      );
    });

    it('un nombre de solo espacios responde 400 (antes se guardaba vacío)', async () => {
      await expect(
        as(() => service.create({ ...dto, name: '   ' })),
      ).rejects.toThrow(
        new BadRequestException('El nombre del área es obligatorio'),
      );
    });

    it('un área activa con el mismo nombre en la planta responde 400', async () => {
      qb().getOne.mockResolvedValueOnce(stored());

      await expect(as(() => service.create(dto))).rejects.toThrow(
        new BadRequestException(
          'Ya existe un area activa con ese nombre en la planta seleccionada',
        ),
      );
    });

    it('una inactiva con el mismo nombre pide reactivarla', async () => {
      qb().getOne.mockResolvedValueOnce(null).mockResolvedValueOnce(stored());

      await expect(as(() => service.create(dto))).rejects.toThrow(
        /Ya existe un area inactiva con ese nombre/,
      );
    });
  });

  describe('findAll', () => {
    it('filtra por nombre y planta (activas)', async () => {
      await service.findAll({ name: 'alm', manufacturingPlantId: 1 });

      const { where } = areas.find.mock.calls[0][0] as {
        where: { name: FindOperator<string>; manufacturingPlant: object };
      };
      expect(where.name.value).toBe('%alm%');
      expect(where.manufacturingPlant).toEqual({ isActive: true, id: 1 });
    });

    it('con page y limit responde paginado', async () => {
      areas.findAndCount.mockResolvedValue([[], 0]);

      await expect(
        service.findAll({ page: 1, limit: 5 }),
      ).resolves.toMatchObject({
        count: 0,
      });
    });
  });

  describe('findOne', () => {
    it('inexistente responde 404', async () => {
      areas.findOne.mockResolvedValue(null);

      await expect(service.findOne(4)).rejects.toThrow(
        new NotFoundException('Area con ID 4 no encontrado'),
      );
    });

    it('inactiva responde 400 (salvo que se pida incluirla)', async () => {
      areas.findOne.mockResolvedValue(stored({ isActive: false }));

      await expect(service.findOne(4)).rejects.toThrow(
        new BadRequestException('El area con ID 4 esta inactiva'),
      );
      await expect(service.findOne(4, false)).resolves.toMatchObject({ id: 4 });
    });
  });

  describe('update', () => {
    it('cambia solo lo enviado y excluye la propia área al validar el nombre', async () => {
      await as(() => service.update(4, { name: ' Bodega ', coordinateX: 0 }));

      expect(areas.preload).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 4,
          name: 'Bodega',
          coordinateX: 0,
          manufacturingPlant: { id: 1 },
          updatedBy: { id: 10 },
        }),
      );
      expect(areas.preload.mock.calls[0][0]).not.toHaveProperty('coordinateY');
      expect(qb().andWhere).toHaveBeenCalledWith('area.id <> :excludeId', {
        excludeId: 4,
      });
    });

    it('sin nombre no valida duplicados', async () => {
      await as(() => service.update(4, { zoomLevel: 2, coordinateY: 3 }));

      expect(qb().getOne).not.toHaveBeenCalled();
      expect(areas.preload.mock.calls[0][0]).toMatchObject({
        zoomLevel: 2,
        coordinateY: 3,
      });
    });
  });

  it('remove desactiva el área', async () => {
    areas.save.mockImplementation(async (a) => a as never);

    await expect(as(() => service.remove(4))).resolves.toMatchObject({
      isActive: false,
      updatedBy: { id: 10 },
    });
  });
});
