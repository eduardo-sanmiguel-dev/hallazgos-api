import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Brackets } from 'typeorm';

import {
  buildUser,
  createServiceTestingModule,
  type RepositoryMock,
  runAsUser,
} from '../../test/utils/index.js';
import { ExtinguisherInspection } from './entities/extinguisher-inspection.entity.js';
import { ExtinguisherInspectionEvaluation } from './entities/extinguisher-inspection-evaluation.entity.js';
import { ExtinguisherInspectionsService } from './extinguisher-inspections.service.js';

// 2026-10-20 19:30 en México (UTC-6) = 2026-10-21 01:30 UTC.
const MEXICO_EVENING = new Date('2026-10-21T01:30:00Z');

describe('ExtinguisherInspectionsService', () => {
  let service: ExtinguisherInspectionsService;
  let inspections: RepositoryMock<ExtinguisherInspection>;
  let evaluations: RepositoryMock<ExtinguisherInspectionEvaluation>;
  let plantCountry: string | null;
  const user = buildUser({
    id: 10,
    manufacturingPlants: [{ id: 1 }, { id: 2 }] as never,
  });
  const as = <R>(fn: () => R): Promise<Awaited<R>> =>
    runAsUser(user, fn as () => Promise<Awaited<R>>);

  const evaluation = (overrides: object = {}) => ({
    location: 'Almacén norte',
    extinguisherNumber: 'F4E-321',
    nextRechargeDate: '2026-12-01',
    maintenanceDate: '2026-11-01',
    ...overrides,
  });

  beforeEach(async () => {
    const testing = await createServiceTestingModule(
      ExtinguisherInspectionsService,
      {
        repositories: [
          ExtinguisherInspection,
          ExtinguisherInspectionEvaluation,
        ],
      },
    );
    service = testing.service;
    inspections = testing.repository(ExtinguisherInspection);
    evaluations = testing.repository(ExtinguisherInspectionEvaluation);

    plantCountry = 'México';
    Object.assign(inspections, {
      manager: {
        transaction: jest.fn(async (callback) =>
          callback({
            getRepository: (entity) =>
              entity === ExtinguisherInspection ? inspections : evaluations,
          }),
        ),
        findOne: jest.fn(async () =>
          plantCountry === null ? null : { country: { name: plantCountry } },
        ),
      },
    });
    inspections.save.mockImplementation(
      async (row) => ({ id: 30, ...row }) as never,
    );
    inspections.queryBuilder.getOne.mockResolvedValue({
      id: 30,
      manufacturingPlant: { id: 1 },
    } as never);

    jest.useFakeTimers({
      now: MEXICO_EVENING,
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });
  });

  afterEach(() => jest.useRealTimers());

  describe('create', () => {
    const create = (rows: object[]) =>
      as(() =>
        service.create({ manufacturingPlantId: 1, evaluations: rows as never }),
      );

    it('guarda la inspección (fecha y responsable = quien la registra) y sus evaluaciones', async () => {
      await expect(create([evaluation()])).resolves.toMatchObject({ id: 30 });

      expect(inspections.create).toHaveBeenCalledWith(
        expect.objectContaining({
          inspectionDate: MEXICO_EVENING,
          responsible: { id: 10 },
          manufacturingPlant: { id: 1 },
          createdBy: { id: 10 },
        }),
      );
      expect(evaluations.create).toHaveBeenCalledWith(
        expect.objectContaining({
          extinguisherNumber: 'F4E-321',
          extinguisherInspection: { id: 30 },
        }),
      );
      expect(evaluations.save).toHaveBeenCalledTimes(1);
    });

    it('acepta fechas de hoy según la planta (antes, en la tarde de México se rechazaban)', async () => {
      await expect(
        create([
          evaluation({
            nextRechargeDate: '2026-10-20',
            maintenanceDate: '2026-10-20',
          }),
        ]),
      ).resolves.toMatchObject({ id: 30 });
    });

    it('en una planta de Colombia usa el día de Bogotá', async () => {
      plantCountry = 'Colombia';

      // En Bogotá ya son las 20:30 del 2026-10-20: ayer sigue siendo pasado.
      await expect(
        create([evaluation({ maintenanceDate: '2026-10-19' })]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each([
      ['próxima recarga', { nextRechargeDate: '2026-10-19' }],
      ['mantenimiento', { maintenanceDate: '2026-10-19' }],
    ])(
      'una fecha de %s pasada responde 400 sin guardar',
      async (_c, override) => {
        await expect(create([evaluation(override)])).rejects.toThrow(
          new BadRequestException(
            'No se permiten fechas de próxima recarga o mantenimiento anteriores a la fecha actual.',
          ),
        );
        expect(inspections.save).not.toHaveBeenCalled();
      },
    );

    it('sin planta encontrada usa la hora de México', async () => {
      plantCountry = null;

      await expect(
        create([evaluation({ maintenanceDate: '2026-10-20' })]),
      ).resolves.toMatchObject({
        id: 30,
      });
    });

    it('sin evaluaciones guarda solo la inspección', async () => {
      await as(() => service.create({ manufacturingPlantId: 1 }));

      expect(evaluations.save).toHaveBeenCalledWith([]);
    });
  });

  describe('findAll', () => {
    const qb = () => inspections.queryBuilder;

    it('sin filtros: inspecciones activas, más recientes primero, sin paginar', async () => {
      qb().getMany.mockResolvedValue([]);

      await expect(as(async () => service.findAll({}))).resolves.toEqual([]);
      expect(qb().where).toHaveBeenCalledWith(
        'extinguisherInspection.isActive = :isActive',
        { isActive: true },
      );
      expect(qb().andWhere).toHaveBeenCalledWith(
        'manufacturingPlant.id IN (:...allowedPlantIds)',
        { allowedPlantIds: [1, 2] },
      );
    });

    it('aplica búsqueda, planta, responsable y rango de fechas', async () => {
      qb().getMany.mockResolvedValue([]);

      await as(async () =>
        service.findAll({
          search: '12',
          manufacturingPlantId: 1,
          responsibleId: 2,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        }),
      );

      expect(qb().andWhere).toHaveBeenCalledWith(expect.any(Brackets));
      expect(qb().andWhere).toHaveBeenCalledWith(
        'manufacturingPlant.id = :manufacturingPlantId',
        { manufacturingPlantId: 1 },
      );
      expect(qb().andWhere).toHaveBeenCalledWith(
        'responsible.id = :responsibleId',
        {
          responsibleId: 2,
        },
      );
      expect(qb().andWhere).toHaveBeenCalledWith(
        'extinguisherInspection.inspectionDate >= :startDate',
        { startDate: '2026-01-01' },
      );
      expect(qb().andWhere).toHaveBeenCalledWith(
        'extinguisherInspection.inspectionDate <= :endDate',
        { endDate: '2026-12-31' },
      );
    });

    it('la búsqueda compara el folio o el nombre del responsable', async () => {
      qb().getMany.mockResolvedValue([]);

      await as(async () => service.findAll({ search: '12' }));

      const brackets = qb()
        .andWhere.mock.calls.map(([condition]) => condition)
        .find((condition) => condition instanceof Brackets) as Brackets;
      const inner = { where: jest.fn(), orWhere: jest.fn() };
      inner.where.mockReturnValue(inner);
      brackets.whereFactory(inner as never);
      expect(inner.where).toHaveBeenCalledWith(
        'CAST(extinguisherInspection.id AS TEXT) ILIKE :search',
        { search: '%12%' },
      );
      expect(inner.orWhere).toHaveBeenCalledWith(
        'responsible.name ILIKE :search',
        { search: '%12%' },
      );
    });

    it('un usuario sin plantas no ve ninguna planta', async () => {
      qb().getMany.mockResolvedValue([]);

      await runAsUser(buildUser({ manufacturingPlants: [] }), async () =>
        service.findAll({}),
      );

      expect(qb().andWhere).toHaveBeenCalledWith(
        'manufacturingPlant.id IN (:...allowedPlantIds)',
        { allowedPlantIds: [-1] },
      );
    });

    it('paginado aplica skip/take; limit -1 trae todo', async () => {
      qb().getManyAndCount.mockResolvedValue([[], 7]);

      await expect(
        as(async () => service.findAll({ page: 2, limit: 5 })),
      ).resolves.toEqual({
        data: [],
        count: 7,
      });
      expect(qb().skip).toHaveBeenCalledWith(5);
      expect(qb().take).toHaveBeenCalledWith(5);

      qb().skip.mockClear();
      await as(async () => service.findAll({ page: 1, limit: -1 }));
      expect(qb().skip).not.toHaveBeenCalled();
    });

    it('ordena en la BD: más recientes por omisión, o la columna pedida', async () => {
      qb().getMany.mockResolvedValue([]);

      await as(async () => service.findAll({}));
      expect(qb().orderBy).toHaveBeenLastCalledWith(
        'extinguisherInspection.id',
        'DESC',
        'NULLS LAST',
      );

      await as(async () =>
        service.findAll({ orderBy: 'responsible', order: 'asc' }),
      );
      expect(qb().orderBy).toHaveBeenLastCalledWith(
        'responsible.name',
        'ASC',
        'NULLS LAST',
      );
      expect(qb().addOrderBy).toHaveBeenLastCalledWith(
        'extinguisherInspection.id',
        'ASC',
      );
    });
  });

  describe('findOne', () => {
    it('un usuario sin plantas no ve ninguna planta', async () => {
      await runAsUser(buildUser({ manufacturingPlants: [] }), async () =>
        service.findOne(30),
      );

      expect(inspections.queryBuilder.andWhere).toHaveBeenCalledWith(
        'manufacturingPlant.id IN (:...allowedPlantIds)',
        { allowedPlantIds: [-1] },
      );
    });

    it('una inspección inexistente o inactiva responde 404', async () => {
      inspections.queryBuilder.getOne.mockResolvedValue(null);

      await expect(as(async () => service.findOne(30))).rejects.toThrow(
        new NotFoundException('Inspección de extintores #30 no encontrada'),
      );
    });
  });

  it('getDownloadFileName usa la planta, el país y la fecha guardada', async () => {
    inspections.query.mockResolvedValue([
      {
        plantName: 'Tepotzotlán',
        countryName: 'México',
        storedCreatedAt: '2026-10-20 10:00:00',
      },
    ]);

    await expect(
      as(async () => service.getDownloadFileName(30)),
    ).resolves.toMatch(/30/);
    expect(inspections.query.mock.calls[0][1]).toEqual([30]);
  });

  describe('update', () => {
    it('actualiza datos y planta, y reemplaza las evaluaciones activas', async () => {
      await as(() =>
        service.update(30, {
          manufacturingPlantId: 2,
          evaluations: [evaluation()] as never,
        }),
      );

      expect(inspections.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 30,
          manufacturingPlant: { id: 2 },
          updatedBy: { id: 10 },
          updatedAt: MEXICO_EVENING,
        }),
      );
      expect(evaluations.queryBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false, updatedBy: { id: 10 } }),
      );
      expect(evaluations.queryBuilder.execute).toHaveBeenCalled();
      expect(evaluations.save).toHaveBeenCalledWith([
        expect.objectContaining({ extinguisherInspection: { id: 30 } }),
      ]);
    });

    it('sin planta nueva valida las fechas con el día de la planta actual', async () => {
      await as(() =>
        service.update(30, { evaluations: [evaluation()] as never }),
      );

      expect(inspections.manager.findOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ where: { id: 1 } }),
      );
      expect(evaluations.save).toHaveBeenCalled();
    });

    it('rechaza fechas de recarga o mantenimiento anteriores a hoy', async () => {
      await expect(
        as(() =>
          service.update(30, {
            evaluations: [
              evaluation({ maintenanceDate: '2020-01-01' }),
            ] as never,
          }),
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'No se permiten fechas de próxima recarga o mantenimiento anteriores a la fecha actual.',
        ),
      );
      expect(inspections.save).not.toHaveBeenCalled();
    });

    it('con lista vacía solo desactiva; sin lista no toca las evaluaciones', async () => {
      await as(() => service.update(30, { evaluations: [] }));
      expect(evaluations.queryBuilder.execute).toHaveBeenCalledTimes(1);
      expect(evaluations.save).not.toHaveBeenCalled();

      await as(() => service.update(30, {}));
      expect(evaluations.queryBuilder.execute).toHaveBeenCalledTimes(1);
      expect(inspections.merge.mock.calls[1][2]).toEqual({});
    });
  });

  describe('remove', () => {
    it('desactiva la inspección y sus evaluaciones y la devuelve', async () => {
      inspections.findOne.mockResolvedValue({
        id: 30,
        isActive: false,
      } as never);

      await expect(as(() => service.remove(30))).resolves.toMatchObject({
        id: 30,
        isActive: false,
      });
      expect(inspections.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false, updatedBy: { id: 10 } }),
      );
      expect(evaluations.queryBuilder.execute).toHaveBeenCalled();
    });

    it('si no se puede releer responde 404', async () => {
      await expect(as(() => service.remove(30))).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
