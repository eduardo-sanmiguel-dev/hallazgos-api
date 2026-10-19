import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';

import { ManufacturingPlant } from './entities/manufacturing-plant.entity';
import { ManufacturingPlantsService } from './manufacturing-plants.service';

describe('ManufacturingPlantsService.findIdsByNamesOrFail', () => {
  const find = jest.fn();
  const service = new ManufacturingPlantsService({
    find,
  } as unknown as Repository<ManufacturingPlant>);

  beforeEach(() => find.mockReset());

  it('resuelve todos los nombres en una sola consulta, en el orden pedido', async () => {
    find.mockResolvedValue([
      { id: 2, name: 'Manizales' },
      { id: 1, name: 'Tepotzotlán' },
    ]);

    await expect(
      service.findIdsByNamesOrFail(['Tepotzotlán', 'Manizales']),
    ).resolves.toEqual([1, 2]);
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('lanza el mismo 404 que findOneByName si falta una planta', async () => {
    find.mockResolvedValue([{ id: 1, name: 'Tepotzotlán' }]);

    await expect(
      service.findIdsByNamesOrFail(['Tepotzotlán', 'No existe']),
    ).rejects.toThrow(
      new NotFoundException('Planta con nombre No existe no encontrada'),
    );
  });
});
