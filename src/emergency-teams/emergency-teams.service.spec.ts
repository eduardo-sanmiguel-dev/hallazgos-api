import { NotFoundException } from '@nestjs/common';
import { Brackets } from 'typeorm';

import {
  buildUser,
  createServiceTestingModule,
  type RepositoryMock,
  runAsUser,
} from '../../test/utils/index.js';
import { EmergencyTeam } from './entities/emergency-team.entity.js';
import { EmergencyTeamsService } from './emergency-teams.service.js';

describe('EmergencyTeamsService', () => {
  let service: EmergencyTeamsService;
  let teams: RepositoryMock<EmergencyTeam>;
  const user = buildUser({
    id: 10,
    manufacturingPlants: [{ id: 1 }, { id: 2 }] as never,
  });
  const as = <R>(fn: () => R): Promise<Awaited<R>> =>
    runAsUser(user, fn as () => Promise<Awaited<R>>);
  const qb = () => teams.queryBuilder;

  beforeEach(async () => {
    const testing = await createServiceTestingModule(EmergencyTeamsService, {
      repositories: [EmergencyTeam],
    });
    service = testing.service;
    teams = testing.repository(EmergencyTeam);
    teams.findOne.mockResolvedValue({ id: 2, isActive: true } as EmergencyTeam);
    teams.save.mockImplementation(async (t) => t as never);
  });

  it('create guarda el equipo con su planta y quien lo crea', async () => {
    await as(() =>
      service.create({
        location: 'Almacén',
        extinguisherNumber: 'E-1',
        manufacturingPlantId: 1,
      } as never),
    );

    expect(teams.create).toHaveBeenCalledWith(
      expect.objectContaining({
        location: 'Almacén',
        manufacturingPlant: { id: 1 },
        createdBy: { id: 10 },
      }),
    );
  });

  describe('findAll', () => {
    it('sin paginación devuelve la lista con los filtros aplicados', async () => {
      qb().getMany.mockResolvedValue([]);

      await as(async () =>
        service.findAll({
          search: 'alm',
          manufacturingPlantId: 1,
          typeOfExtinguisher: 'PQS',
        } as never),
      );

      expect(qb().andWhere).toHaveBeenCalledWith(expect.any(Brackets));
      expect(qb().andWhere).toHaveBeenCalledWith(
        'manufacturingPlant.id = :manufacturingPlantId',
        { manufacturingPlantId: 1 },
      );
      expect(qb().andWhere).toHaveBeenCalledWith(
        'emergencyTeam.typeOfExtinguisher = :typeOfExtinguisher',
        { typeOfExtinguisher: 'PQS' },
      );
    });

    it('sin filtros solo lista activos', async () => {
      qb().getMany.mockResolvedValue([]);

      await as(async () => service.findAll({} as never));

      expect(qb().andWhere).toHaveBeenCalledWith(
        'manufacturingPlant.id IN (:...allowedPlantIds)',
        { allowedPlantIds: [1, 2] },
      );
    });

    it('paginado aplica skip/take; limit <= 0 trae todo', async () => {
      qb().getManyAndCount.mockResolvedValue([[], 9]);

      await expect(
        as(async () => service.findAll({ page: 3, limit: 4 } as never)),
      ).resolves.toEqual({ data: [], count: 9 });
      expect(qb().skip).toHaveBeenCalledWith(8);

      qb().skip.mockClear();
      await as(async () => service.findAll({ page: 1, limit: -1 } as never));
      expect(qb().skip).not.toHaveBeenCalled();
    });
  });

  it('findOne inexistente responde 404', async () => {
    teams.findOne.mockResolvedValue(null);

    await expect(as(async () => service.findOne(2))).rejects.toThrow(
      new NotFoundException('Emergency team with id 2 not found'),
    );
  });

  describe('update', () => {
    it('cambia los datos y la planta si llega', async () => {
      await expect(
        as(() =>
          service.update(2, {
            location: 'Patio',
            manufacturingPlantId: 2,
          } as never),
        ),
      ).resolves.toMatchObject({
        location: 'Patio',
        manufacturingPlant: { id: 2 },
        updatedBy: { id: 10 },
      });
    });

    it('sin planta conserva la actual', async () => {
      const result = await as(() =>
        service.update(2, { location: 'Patio' } as never),
      );

      expect(result).not.toHaveProperty('manufacturingPlant');
    });
  });

  it('remove desactiva el equipo', async () => {
    await expect(as(() => service.remove(2))).resolves.toMatchObject({
      isActive: false,
      updatedBy: { id: 10 },
    });
  });
});
