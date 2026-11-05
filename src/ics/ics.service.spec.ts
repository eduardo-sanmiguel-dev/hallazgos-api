import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FindOperator, In } from 'typeorm';

import {
  buildUser,
  createServiceTestingModule,
  type RepositoryMock,
  runAsUser,
} from '../../test/utils/index.js';
import { RulesOfLife } from '../rules-of-life/entities/index.js';
import { Ics } from './entities/ics.entity.js';
import { IcsService } from './ics.service.js';

describe('IcsService', () => {
  let service: IcsService;
  let ics: RepositoryMock<Ics>;
  let rules: RepositoryMock<RulesOfLife>;
  const user = buildUser({
    id: 10,
    manufacturingPlants: [{ id: 1 }, { id: 2 }] as never,
  });
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
    rules.findOne.mockResolvedValue({
      id: 2,
      isActive: true,
      standards: [
        { id: 7, isActive: true, areas: [{ id: 9, isActive: true }] },
        { id: 8, isActive: false, areas: [] },
        { id: 10, isActive: true, areas: [{ id: 11, isActive: false }] },
      ],
    } as RulesOfLife);
    Object.assign(ics, {
      manager: {
        count: jest.fn(
          async (_entity, options) => options.where.id.value.length,
        ),
      },
    });
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
          'Las personas que no cumplen con el estándar no pueden ser más que las personas totales.',
        ),
      );
      expect(ics.save).not.toHaveBeenCalled();
    });
  });

  it('rechaza empleados ajenos sin guardar el ICS', async () => {
    (ics.manager.count as jest.Mock).mockResolvedValueOnce(0);
    await expect(as(() => service.create(dto, undefined))).rejects.toThrow(
      'Uno o más colaboradores no pertenecen a la planta seleccionada.',
    );
    expect(ics.save).not.toHaveBeenCalled();
  });
  it('rechaza crear en una planta ajena antes de validar empleados', async () => {
    await expect(
      as(() => service.create({ ...dto, manufacturingPlantId: 99 }, undefined)),
    ).rejects.toThrow('Planta no encontrada');
    expect(ics.manager.count).not.toHaveBeenCalled();
  });
  it('catalogs devuelve reglas con estándares y áreas, en orden', async () => {
    await as(async () => service.catalogs());

    expect(rules.find).toHaveBeenCalledWith({
      where: { isActive: true },
      relations: ['standards', 'standards.areas'],
      order: { order: 'ASC' },
    });
  });

  it.each([
    [{ standardOfBehaviorId: 8 }, 'estándar'],
    [{ standardOfBehaviorId: 99 }, 'estándar'],
    [{ areaOfBehaviorId: 9 }, 'estándar'],
    [{ standardOfBehaviorId: 7, areaOfBehaviorId: 99 }, 'área'],
    [{ standardOfBehaviorId: 10, areaOfBehaviorId: 11 }, 'área'],
  ])(
    'rechaza relaciones inactivas o ajenas %j antes de guardar',
    async (fields, message) => {
      await expect(
        as(() => service.create({ ...dto, ...fields }, undefined)),
      ).rejects.toThrow(new RegExp(message, 'i'));
      expect(ics.save).not.toHaveBeenCalled();
    },
  );
  it('rechaza una regla inexistente o desactivada', async () => {
    rules.findOne.mockResolvedValue(null);
    await expect(as(() => service.create(dto, undefined))).rejects.toThrow(
      'ya no está disponible',
    );
    expect(ics.save).not.toHaveBeenCalled();
  });
  it('el catálogo conserva reglas y estándares sin hijos activos', async () => {
    rules.find.mockResolvedValue([
      {
        id: 2,
        isActive: true,
        standards: [
          { id: 7, isActive: true, areas: [{ id: 9, isActive: false }] },
          { id: 8, isActive: false, areas: [] },
        ],
      },
      { id: 3, isActive: true, standards: [] },
    ] as RulesOfLife[]);
    expect(await service.catalogs()).toEqual([
      {
        id: 2,
        isActive: true,
        standards: [{ id: 7, isActive: true, areas: [] }],
      },
      { id: 3, isActive: true, standards: [] },
    ]);
  });

  describe('findAll', () => {
    it('filtra por planta y área y busca en regla o estándar', async () => {
      await as(async () =>
        service.findAll({
          manufacturingPlantId: 1,
          areaOfBehaviorId: 9,
          name: ' epp ',
        }),
      );

      const { where } = ics.find.mock.calls[0][0] as {
        where: Record<string, { name?: FindOperator<string> } | unknown>[];
      };
      expect(where).toHaveLength(2);
      expect(where[0]).toMatchObject({
        isActive: true,
        manufacturingPlant: { id: In([1]) },
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

      await expect(
        as(async () => service.findAll({ page: 2, limit: 3 })),
      ).resolves.toEqual({
        data: [],
        count: 4,
      });
      await as(async () => service.findAll({ page: 1, limit: -1 }));

      expect(ics.findAndCount.mock.calls[0][0]).toMatchObject({
        take: 3,
        skip: 3,
      });
      expect(ics.findAndCount.mock.calls[1][0]).not.toHaveProperty('take');
    });
  });

  describe('findOne y remove', () => {
    it('inexistente responde 404', async () => {
      await expect(as(async () => service.findOne(3))).rejects.toThrow(
        new NotFoundException('Registro de ICS #3 no encontrado'),
      );
    });

    it('remove desactiva el registro', async () => {
      ics.findOne.mockResolvedValue({ id: 3 } as Ics);

      await expect(as(async () => service.remove(3))).resolves.toEqual({
        id: 3,
      });
      expect(ics.update).toHaveBeenCalledWith(3, {
        isActive: false,
        updatedAt: expect.any(Date),
      });
    });
  });
});
