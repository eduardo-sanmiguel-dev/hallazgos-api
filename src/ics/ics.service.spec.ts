import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FindOperator } from 'typeorm';

import {
  buildUser,
  createServiceTestingModule,
  RepositoryMock,
  runAsUser,
} from '@test/utils';
import { RulesOfLife } from 'rules-of-life/entities';
import { Ics } from './entities/ics.entity';
import { IcsService } from './ics.service';

describe('IcsService', () => {
  let service: IcsService;
  let ics: RepositoryMock<Ics>;
  let rules: RepositoryMock<RulesOfLife>;
  const user = buildUser({ id: 10 });
  const as = <R>(fn: () => R): Promise<Awaited<R>> =>
    runAsUser(user, fn as () => Promise<Awaited<R>>);

  const dto = {
    description: 'Ronda',
    totalPeople: 8,
    manufacturingPlantId: 1,
    ruleOfLifeId: 2,
    employeesIds: [5, 6],
  };

  beforeEach(async () => {
    const testing = await createServiceTestingModule(IcsService, {
      repositories: [Ics, RulesOfLife],
    });
    service = testing.service;
    ics = testing.repository(Ics);
    rules = testing.repository(RulesOfLife);
  });

  describe('create', () => {
    it('calcula personas correctas, incorrectas y el porcentaje de cumplimiento', async () => {
      await as(() =>
        service.create(dto, {
          filename: 'uuid-evidence.png',
        } as Express.Multer.File),
      );

      expect(ics.save).toHaveBeenCalledWith(
        expect.objectContaining({
          totalPeople: 8,
          totalIncorrectPeople: 2,
          totalCorrectPeople: 6,
          icsPercentage: 75,
          ruleOfLife: { id: 2 },
          manufacturingPlant: { id: 1 },
          createdBy: { id: 10 },
          imgEvidence: 'uuid-evidence.png',
          employees: [{ id: 5 }, { id: 6 }],
        }),
      );
    });

    it('redondea el porcentaje a 2 decimales e incluye estándar y área si llegan', async () => {
      await as(() =>
        service.create(
          {
            ...dto,
            totalPeople: 3,
            employeesIds: [5],
            standardOfBehaviorId: 7,
            areaOfBehaviorId: 9,
          },
          undefined,
        ),
      );

      expect(ics.save).toHaveBeenCalledWith(
        expect.objectContaining({
          icsPercentage: 66.67,
          imgEvidence: '',
          standardOfBehavior: { id: 7 },
          areaOfBehavior: { id: 9 },
        }),
      );
    });

    it('más personas incorrectas que el total responde 400 (antes guardaba negativos)', async () => {
      await expect(
        as(() => service.create({ ...dto, totalPeople: 1 }, undefined)),
      ).rejects.toThrow(
        new BadRequestException(
          'Las personas con comportamiento incorrecto no pueden ser más que el total de personas',
        ),
      );
      expect(ics.save).not.toHaveBeenCalled();
    });
  });

  it('catalogs devuelve reglas con estándares y áreas, en orden', async () => {
    await service.catalogs();

    expect(rules.find).toHaveBeenCalledWith({
      relations: ['standards', 'standards.areas'],
      order: { order: 'ASC' },
    });
  });

  describe('findAll', () => {
    it('filtra por planta y área y busca en regla o estándar', async () => {
      await service.findAll({
        manufacturingPlantId: 1,
        areaOfBehaviorId: 9,
        name: ' epp ',
      });

      const { where } = ics.find.mock.calls[0][0] as {
        where: Record<string, { name?: FindOperator<string> } | unknown>[];
      };
      expect(where).toHaveLength(2);
      expect(where[0]).toMatchObject({
        isActive: true,
        manufacturingPlant: { id: 1 },
        areaOfBehavior: { id: 9 },
      });
      expect(
        (where[0].ruleOfLife as { name: FindOperator<string> }).name.value,
      ).toBe('%epp%');
      expect(
        (where[1].standardOfBehavior as { name: FindOperator<string> }).name
          .value,
      ).toBe('%epp%');
    });

    it('paginado: skip/take; limit -1 trae todo', async () => {
      ics.findAndCount.mockResolvedValue([[], 4]);

      await expect(service.findAll({ page: 2, limit: 3 })).resolves.toEqual({
        data: [],
        count: 4,
      });
      await service.findAll({ page: 1, limit: -1 });

      expect(ics.findAndCount.mock.calls[0][0]).toMatchObject({
        take: 3,
        skip: 3,
      });
      expect(ics.findAndCount.mock.calls[1][0]).not.toHaveProperty('take');
    });
  });

  describe('findOne y remove', () => {
    it('inexistente responde 404', async () => {
      await expect(service.findOne(3)).rejects.toThrow(
        new NotFoundException('Ics with id 3 not found'),
      );
    });

    it('remove desactiva el registro', async () => {
      ics.findOne.mockResolvedValue({ id: 3 } as Ics);

      await expect(service.remove(3)).resolves.toEqual({ id: 3 });
      expect(ics.update).toHaveBeenCalledWith(3, {
        isActive: false,
        updatedAt: expect.any(Date),
      });
    });
  });
});
