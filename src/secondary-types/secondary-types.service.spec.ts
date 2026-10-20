import { NotFoundException } from '@nestjs/common';
import { FindOperator } from 'typeorm';

import {
  createServiceTestingModule,
  mockProvider,
  RepositoryMock,
} from '@test/utils';
import { MainTypesService } from 'main-types/main-types.service';
import { SecondaryType } from './entities/secondary-type.entity';
import { SecondaryTypesService } from './secondary-types.service';

describe('SecondaryTypesService', () => {
  let service: SecondaryTypesService;
  let types: RepositoryMock<SecondaryType>;
  let mainTypes: jest.Mocked<MainTypesService>;

  const stored = () =>
    ({
      id: 5,
      name: 'Orden y limpieza',
      isActive: true,
      mainType: { id: 1, name: 'Condición insegura' },
    }) as unknown as SecondaryType;

  beforeEach(async () => {
    const testing = await createServiceTestingModule(SecondaryTypesService, {
      repositories: [SecondaryType],
      providers: [mockProvider(MainTypesService)],
    });
    service = testing.service;
    types = testing.repository(SecondaryType);
    mainTypes = testing.get(MainTypesService);
    mainTypes.findOne.mockImplementation(async (id) => ({ id }) as never);
    types.findOne.mockResolvedValue(stored());
    types.preload.mockImplementation(async (t) => t as never);
  });

  it('create guarda el tipo con su tipo principal validado', async () => {
    await service.create({
      name: 'Derrames',
      mainTypeId: 1,
      typeResponsible: 'Supervisor',
    });

    expect(mainTypes.findOne).toHaveBeenCalledWith(1);
    expect(types.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Derrames', mainType: { id: 1 } }),
    );
  });

  describe('findAll', () => {
    it('filtra por nombre y tipo principal', async () => {
      await service.findAll({ name: 'orden', mainTypeId: 1 } as never);

      const { where } = types.find.mock.calls[0][0] as {
        where: { name: FindOperator<string>; mainType: object };
      };
      expect(where.name.value).toBe('%orden%');
      expect(where.mainType).toEqual({ id: 1 });
    });

    it('paginado si se pide', async () => {
      types.findAndCount.mockResolvedValue([[], 0]);

      await expect(
        service.findAll({ page: 1, limit: 5 } as never),
      ).resolves.toMatchObject({ count: 0 });
    });
  });

  it('findAllByManufacturingPlant lista los tipos activos de un tipo principal por nombre', async () => {
    await service.findAllByManufacturingPlant(1);

    expect(types.find).toHaveBeenCalledWith({
      where: { mainType: { id: 1 }, isActive: true },
      order: { name: 'ASC' },
    });
  });

  describe('findOne', () => {
    it('inexistente responde 404', async () => {
      types.findOne.mockResolvedValue(null);

      await expect(service.findOne(5)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('con isActive=false incluye inactivos', async () => {
      await service.findOne(5, false);

      expect(types.findOne.mock.calls[0][0].where).toEqual({ id: 5 });
    });
  });

  describe('update', () => {
    it('sin tipo principal conserva el actual (antes tomaba cualquiera)', async () => {
      await service.update(5, { name: 'Orden' });

      expect(mainTypes.findOne).not.toHaveBeenCalled();
      expect(types.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Orden',
          mainType: { id: 1, name: 'Condición insegura' },
        }),
      );
    });

    it('con tipo principal lo valida', async () => {
      await service.update(5, { mainTypeId: 2 });

      expect(mainTypes.findOne).toHaveBeenCalledWith(2);
    });
  });

  it('remove desactiva el tipo', async () => {
    await service.remove(5);

    expect(types.update).toHaveBeenCalledWith(5, { isActive: false });
  });
});
