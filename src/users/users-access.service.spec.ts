import { NotFoundException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import {
  buildAdmin,
  buildUser,
  buildManufacturingPlant,
  createServiceTestingModule,
  mockProvider,
  RepositoryMock,
  runAsUser,
} from '@test/utils';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { ManufacturingPlantsService } from 'manufacturing-plants/manufacturing-plants.service';
import { ZonesService } from 'zones/zones.service';
import { ProcessesService } from 'processes/processes.service';

describe('UsersService: aislamiento por planta en HTTP', () => {
  const plant = buildManufacturingPlant({ id: 1, name: 'México' });
  const other = buildManufacturingPlant({ id: 2, name: 'Colombia' });
  const admin = buildAdmin({ manufacturingPlants: [plant] });
  let service: UsersService;
  let users: RepositoryMock<User>;
  beforeEach(async () => {
    const testing = await createServiceTestingModule(UsersService, {
      repositories: [User],
      providers: [
        mockProvider(ManufacturingPlantsService),
        mockProvider(ZonesService),
        mockProvider(ProcessesService),
      ],
    });
    service = testing.service;
    users = testing.repository(User);
  });
  it('permite el detalle en una planta compartida', async () => {
    const target = buildUser({ manufacturingPlants: [plant, other] });
    users.findOne.mockResolvedValue(target);
    await expect(
      runAsUser(admin, async () => service.findOneForRequest(target.id)),
    ).resolves.toBe(target);
  });
  it('oculta el detalle de una planta ajena incluso al administrador', async () => {
    users.findOne.mockResolvedValue(
      buildUser({ manufacturingPlants: [other] }),
    );
    await expect(
      runAsUser(admin, async () => service.findOneForRequest(7)),
    ).rejects.toThrow(NotFoundException);
  });
  it('no permite asignar plantas ajenas', async () => {
    await expect(
      runAsUser(admin, async () =>
        service.assertPlantsForRequest(['Colombia']),
      ),
    ).rejects.toThrow(NotFoundException);
    await runAsUser(admin, async () =>
      service.assertPlantsForRequest(['México']),
    );
  });
  it.each([undefined, 1, 2])(
    'la lista respeta las plantas del usuario con filtro %s',
    async (manufacturingPlantId) => {
      await runAsUser(admin, async () =>
        service.findAllForRequest({ manufacturingPlantId } as never),
      );
      const [{ where }] = users.find.mock.calls[0] as [
        { where: { manufacturingPlants: { id: FindOperator<number> } }[] },
      ];
      expect(where[0].manufacturingPlants.id.value).toEqual(
        manufacturingPlantId === 2 ? [] : [1],
      );
    },
  );
});
