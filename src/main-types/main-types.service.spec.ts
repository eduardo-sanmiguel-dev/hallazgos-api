import { NotFoundException } from '@nestjs/common';
import { FindOperator } from 'typeorm';

import {
  createServiceTestingModule,
  type RepositoryMock,
} from '../../test/utils/index.js';
import { MainType } from './entities/main-type.entity.js';
import { MainTypesService } from './main-types.service.js';

describe('MainTypesService', () => {
  let service: MainTypesService;
  let types: RepositoryMock<MainType>;

  beforeEach(async () => {
    const testing = await createServiceTestingModule(MainTypesService, {
      repositories: [MainType],
    });
    service = testing.service;
    types = testing.repository(MainType);
    types.findOne.mockResolvedValue({ id: 1, isActive: true } as MainType);
    types.preload.mockImplementation(async (t) => t as never);
  });

  it('create guarda el tipo', async () => {
    await service.create({ name: 'Acto inseguro' });

    expect(types.save).toHaveBeenCalledWith({ name: 'Acto inseguro' });
  });

  it('findAll filtra activos por nombre con sus tipos secundarios', async () => {
    await service.findAll({ name: 'acto' } as never);

    const { where, relations } = types.find.mock.calls[0][0] as {
      where: { name: FindOperator<string> };
      relations: string[];
    };
    expect(where.name.value).toBe('%acto%');
    expect(relations).toEqual(['secondaryTypes']);
  });

  it('findAll paginado si se pide', async () => {
    types.findAndCount.mockResolvedValue([[], 0]);

    await expect(
      service.findAll({ page: 1, limit: 5 } as never),
    ).resolves.toMatchObject({ count: 0 });
  });

  it('el catálogo omite tipos inactivos y conserva criterios sin tipos activos', async () => {
    const active = { id: 24, isActive: true };
    const inactive = { id: 23, isActive: false };
    types.find.mockResolvedValue([
      { id: 3, secondaryTypes: [inactive, active] },
      { id: 4, secondaryTypes: [inactive] },
      { id: 5, secondaryTypes: [] },
    ] as MainType[]);
    const result = await service.findAll({} as never);
    expect(result).toEqual([
      { id: 3, secondaryTypes: [active] },
      { id: 4, secondaryTypes: [] },
      { id: 5, secondaryTypes: [] },
    ]);
    expect(types.find.mock.results).toHaveLength(1);
  });

  it('el listado paginado filtra hijos sin alterar padres ni conteo', async () => {
    types.findAndCount.mockResolvedValue([
      [{ id: 3, secondaryTypes: [{ id: 23, isActive: false }] }] as MainType[],
      7,
    ]);
    await expect(
      service.findAll({ page: 1, limit: 1 } as never),
    ).resolves.toEqual({
      data: [{ id: 3, secondaryTypes: [] }],
      count: 7,
    });
  });

  it('conserva los tipos históricos en el detalle del criterio', async () => {
    const current = {
      id: 3,
      secondaryTypes: [{ id: 23, isActive: false }],
    } as MainType;
    types.findOne.mockResolvedValue(current);
    expect(await service.findOne(3)).toBe(current);
  });

  it('findOne inexistente responde 404; con isActive=false incluye inactivos', async () => {
    await service.findOne(1, false);
    expect(types.findOne.mock.calls[0][0].where).toEqual({ id: 1 });

    types.findOne.mockResolvedValue(null);
    await expect(service.findOne(1)).rejects.toThrow(
      new NotFoundException('Criterio #1 no encontrado'),
    );
  });

  it('update valida que exista y guarda', async () => {
    await service.update(1, { name: 'Nuevo' });

    expect(types.save).toHaveBeenCalledWith({ id: 1, name: 'Nuevo' });
  });

  it('remove desactiva el tipo', async () => {
    await service.remove(1);

    expect(types.update).toHaveBeenCalledWith(1, { isActive: false });
  });
});
