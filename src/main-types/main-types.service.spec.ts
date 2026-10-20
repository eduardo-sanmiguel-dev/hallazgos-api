import { NotFoundException } from '@nestjs/common';
import { FindOperator } from 'typeorm';

import { createServiceTestingModule, RepositoryMock } from '@test/utils';
import { MainType } from './entities/main-type.entity';
import { MainTypesService } from './main-types.service';

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

  it('findOne inexistente responde 404; con isActive=false incluye inactivos', async () => {
    await service.findOne(1, false);
    expect(types.findOne.mock.calls[0][0].where).toEqual({ id: 1 });

    types.findOne.mockResolvedValue(null);
    await expect(service.findOne(1)).rejects.toThrow(
      new NotFoundException('Criterio con ID 1 no encontrado'),
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
