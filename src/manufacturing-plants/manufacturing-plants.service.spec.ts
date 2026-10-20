import { NotFoundException } from '@nestjs/common';

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
