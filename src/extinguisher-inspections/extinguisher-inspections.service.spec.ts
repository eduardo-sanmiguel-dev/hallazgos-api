import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Brackets } from 'typeorm';

import {
  buildUser,
  createServiceTestingModule,
  RepositoryMock,
  runAsUser,
} from '@test/utils';
import { ExtinguisherInspection } from './entities/extinguisher-inspection.entity';
import { ExtinguisherInspectionEvaluation } from './entities/extinguisher-inspection-evaluation.entity';
import { ExtinguisherInspectionsService } from './extinguisher-inspections.service';

// 2026-10-20 19:30 en México (UTC-6) = 2026-10-21 01:30 UTC.
const MEXICO_EVENING = new Date('2026-10-21T01:30:00Z');

describe('ExtinguisherInspectionsService', () => {
  let service: ExtinguisherInspectionsService;
  let inspections: RepositoryMock<ExtinguisherInspection>;
  let evaluations: RepositoryMock<ExtinguisherInspectionEvaluation>;
  let plantCountry: string | null;
  const user = buildUser({ id: 10 });
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
        findOne: jest.fn(async () =>
          plantCountry === null ? null : { country: { name: plantCountry } },
        ),
      },
    });
    inspections.save.mockImplementation(
      async (row) => ({ id: 30, ...row }) as never,
    );
    inspections.queryBuilder.getOne.mockResolvedValue({ id: 30 } as never);

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
      await expect(create([evaluation()])).resolves.toEqual({ id: 30 });

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
      ).resolves.toEqual({ id: 30 });
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
      ).resolves.toEqual({
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

      await expect(service.findAll({})).resolves.toEqual([]);
      expect(qb().where).toHaveBeenCalledWith(
        'extinguisherInspection.isActive = :isActive',
        { isActive: true },
      );
      expect(qb().andWhere).not.toHaveBeenCalled();
    });

    it('aplica búsqueda, planta, responsable y rango de fechas', async () => {
      qb().getMany.mockResolvedValue([]);

      await service.findAll({
        search: '12',
        manufacturingPlantId: 1,
        responsibleId: 2,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });

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

    it('paginado aplica skip/take; limit -1 trae todo', async () => {
      qb().getManyAndCount.mockResolvedValue([[], 7]);

      await expect(service.findAll({ page: 2, limit: 5 })).resolves.toEqual({
        data: [],
        count: 7,
      });
      expect(qb().skip).toHaveBeenCalledWith(5);
      expect(qb().take).toHaveBeenCalledWith(5);

      qb().skip.mockClear();
      await service.findAll({ page: 1, limit: -1 });
      expect(qb().skip).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('una inspección inexistente o inactiva responde 404', async () => {
      inspections.queryBuilder.getOne.mockResolvedValue(null);

      await expect(service.findOne(30)).rejects.toThrow(
        new NotFoundException('Extinguisher inspection with id 30 not found'),
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

    await expect(service.getDownloadFileName(30)).resolves.toMatch(/30/);
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
