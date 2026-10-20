import { NotFoundException } from '@nestjs/common';
import { FindOperator } from 'typeorm';

import {
  buildManufacturingPlant,
  createServiceTestingModule,
  RepositoryMock,
} from '@test/utils';
import { ManufacturingPlant } from './entities/manufacturing-plant.entity';
import { ManufacturingPlantsService } from './manufacturing-plants.service';

describe('ManufacturingPlantsService.findIdsByNamesOrFail', () => {
  let service: ManufacturingPlantsService;
  let plants: RepositoryMock<ManufacturingPlant>;

  beforeEach(async () => {
    const testing = await createServiceTestingModule(
      ManufacturingPlantsService,
      { repositories: [ManufacturingPlant] },
    );
    service = testing.service;
    plants = testing.repository(ManufacturingPlant);
  });

  it('resuelve todos los nombres en una sola consulta, en el orden pedido', async () => {
    plants.find.mockResolvedValue([
      buildManufacturingPlant({ id: 2, name: 'Manizales' }),
      buildManufacturingPlant({ id: 1, name: 'Tepotzotlán' }),
    ]);

    await expect(
      service.findIdsByNamesOrFail(['Tepotzotlán', 'Manizales']),
    ).resolves.toEqual([1, 2]);
    expect(plants.find).toHaveBeenCalledTimes(1);
  });

  it('lanza el mismo 404 que findOneByName si falta una planta', async () => {
    plants.find.mockResolvedValue([
      buildManufacturingPlant({ id: 1, name: 'Tepotzotlán' }),
    ]);

    await expect(
      service.findIdsByNamesOrFail(['Tepotzotlán', 'No existe']),
    ).rejects.toThrow(
      new NotFoundException('Planta con nombre No existe no encontrada'),
    );
  });
});

describe('ManufacturingPlantsService', () => {
  let service: ManufacturingPlantsService;
  let plants: RepositoryMock<ManufacturingPlant>;

  beforeEach(async () => {
    const testing = await createServiceTestingModule(
      ManufacturingPlantsService,
      { repositories: [ManufacturingPlant] },
    );
    service = testing.service;
    plants = testing.repository(ManufacturingPlant);
  });

  it('create guarda la planta', async () => {
    const dto = { name: 'Nueva', link: 'https://x.test', lat: 19, lng: -99 };

    await service.create(dto);

    expect(plants.create).toHaveBeenCalledWith(dto);
    expect(plants.save).toHaveBeenCalledWith(dto);
  });

  describe('findAll', () => {
    it('filtra activas por nombre, más recientes primero', async () => {
      await service.findAll({ name: 'tepo' });

      const { where, order } = plants.find.mock.calls[0][0] as {
        where: { isActive: boolean; name: FindOperator<string> };
        order: object;
      };
      expect(where.isActive).toBe(true);
      expect(where.name.value).toBe('%tepo%');
      expect(order).toEqual({ id: 'DESC' });
    });

    it('con page y limit responde paginado', async () => {
      plants.findAndCount.mockResolvedValue([[], 0]);

      await expect(
        service.findAll({ name: undefined, page: 1, limit: 10 }),
      ).resolves.toMatchObject({ count: 0 });
    });
  });

  describe('findOne', () => {
    it('por defecto solo activas; con isActive=false incluye inactivas', async () => {
      plants.findOne.mockResolvedValue(buildManufacturingPlant({ id: 1 }));

      await service.findOne(1);
      await service.findOne(1, false);

      expect(plants.findOne.mock.calls[0][0].where).toEqual({
        id: 1,
        isActive: true,
      });
      expect(plants.findOne.mock.calls[1][0].where).toEqual({ id: 1 });
    });

    it('inexistente responde 404', async () => {
      await expect(service.findOne(1)).rejects.toThrow(
        new NotFoundException('Planta con ID 1 no encontrada'),
      );
    });

    it('findOneByName responde 404 si no existe', async () => {
      await expect(service.findOneByName('X')).rejects.toThrow(
        new NotFoundException('Planta con nombre X no encontrada'),
      );
      plants.findOne.mockResolvedValue(buildManufacturingPlant({ id: 2 }));
      await expect(service.findOneByName('Y')).resolves.toMatchObject({
        id: 2,
      });
    });
  });

  it('update valida que exista y guarda los cambios', async () => {
    plants.findOne.mockResolvedValue(buildManufacturingPlant({ id: 1 }));
    plants.preload.mockImplementation(async (row) => row as never);

    await service.update(1, { name: 'Renombrada' });

    expect(plants.save).toHaveBeenCalledWith({ id: 1, name: 'Renombrada' });
  });

  it('remove desactiva la planta y la devuelve', async () => {
    plants.findOne
      .mockResolvedValueOnce(buildManufacturingPlant({ id: 1 }))
      .mockResolvedValueOnce(
        buildManufacturingPlant({ id: 1, isActive: false }),
      );

    await expect(service.remove(1)).resolves.toMatchObject({
      isActive: false,
    });
    expect(plants.update).toHaveBeenCalledWith(1, { isActive: false });
  });

  it('getColombianPlantsIds devuelve los ids de plantas activas de Colombia', async () => {
    plants.find.mockResolvedValue([
      buildManufacturingPlant({ id: 2 }),
      buildManufacturingPlant({ id: 5 }),
    ]);

    await expect(service.getColombianPlantsIds()).resolves.toEqual([2, 5]);
    expect(plants.find).toHaveBeenCalledWith({
      where: { country: { name: 'Colombia' }, isActive: true },
    });
  });
});
