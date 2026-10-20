import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { FindOperator, QueryFailedError } from 'typeorm';

import {
  buildAdmin,
  buildManufacturingPlant,
  buildUser,
  createServiceTestingModule,
  RepositoryMock,
  runAsUser,
} from '@test/utils';
import { GembaWalkCalendar } from 'gemba-walk-calendar/entities/gemba-walk-calendar.entity';
import { GembaWalkEvaluation } from 'gemba-walk-evaluations/entities/gemba-walk-evaluation.entity';
import { GembaWalkObserver } from 'gemba-walk-observers/entities/gemba-walk-observer.entity';
import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { GembaWalk } from './entities/gemba-walk.entity';
import {
  GEMBA_WALK_TOLERANCE_MINUTES,
  GembaWalksService,
} from './gemba-walks.service';

const SECRET = 'secreto-de-prueba';
const MINUTE = 60_000;
// 10:00 en Tepotzotlán (UTC-6).
const NOW = new Date('2026-10-20T16:00:00Z');

describe('GembaWalksService', () => {
  let service: GembaWalksService;
  let walks: RepositoryMock<GembaWalk>;
  let calendars: RepositoryMock<GembaWalkCalendar>;
  let evaluations: RepositoryMock<GembaWalkEvaluation>;
  let observers: RepositoryMock<GembaWalkObserver>;
  let plants: RepositoryMock<ManufacturingPlant>;

  const plant = buildManufacturingPlant({ id: 1 });
  const observer = buildUser({ id: 10, manufacturingPlants: [plant] });
  const admin = buildAdmin({ id: 20, manufacturingPlants: [plant] });

  const event = (overrides: Partial<GembaWalkCalendar> = {}) =>
    ({
      id: 5,
      isActive: true,
      isAdditional: false,
      scheduledAt: new Date(NOW.getTime() - 5 * MINUTE),
      gembaWalkZone: {
        id: 3,
        isActive: true,
        nameZone: 'Producción',
        nameLocation: 'Línea 1',
        manufacturingPlant: { id: 1 },
      },
      ...overrides,
    }) as GembaWalkCalendar;

  const as = <T>(user: typeof observer, fn: () => Promise<T>) =>
    runAsUser(user, fn);

  beforeEach(async () => {
    const testing = await createServiceTestingModule(GembaWalksService, {
      repositories: [
        GembaWalk,
        GembaWalkCalendar,
        GembaWalkEvaluation,
        GembaWalkObserver,
        ManufacturingPlant,
      ],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => ({ 'jwt.secretKey': SECRET })[key],
          },
        },
      ],
    });
    service = testing.service;
    walks = testing.repository(GembaWalk);
    calendars = testing.repository(GembaWalkCalendar);
    evaluations = testing.repository(GembaWalkEvaluation);
    observers = testing.repository(GembaWalkObserver);
    plants = testing.repository(ManufacturingPlant);

    observers.count.mockResolvedValue(1);
    plants.findOne.mockResolvedValue({
      id: 1,
      country: { name: 'México' },
    } as ManufacturingPlant);
    calendars.findOne.mockResolvedValue(event());
    walks.exists.mockResolvedValue(false);

    jest.useFakeTimers({
      now: NOW,
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });
  });

  afterEach(() => jest.useRealTimers());

  describe('acceso (observadores)', () => {
    it('el administrador entra aunque no esté registrado', async () => {
      await expect(as(admin, () => service.access())).resolves.toEqual({
        isObserver: true,
      });
      expect(observers.count).not.toHaveBeenCalled();
    });

    it('un observador activo (zona y planta activas) entra', async () => {
      await expect(as(observer, () => service.access())).resolves.toEqual({
        isObserver: true,
      });
      expect(observers.count).toHaveBeenCalledWith({
        where: {
          isActive: true,
          user: { id: 10 },
          gembaWalkZone: { isActive: true },
          manufacturingPlant: { isActive: true },
        },
      });
    });

    it('quien no es observador no puede usar el módulo (403)', async () => {
      observers.count.mockResolvedValue(0);

      await expect(as(observer, () => service.access())).resolves.toEqual({
        isObserver: false,
      });
      await expect(as(observer, () => service.findOne(1))).rejects.toThrow(
        new ForbiddenException(
          'Solo los observadores de Gemba Walk pueden acceder a este módulo',
        ),
      );
    });
  });

  describe('findAvailableEvents', () => {
    const qb = () => calendars.queryBuilder;

    beforeEach(() => {
      qb().getMany.mockResolvedValue([event()]);
    });

    it('devuelve los eventos de hoy (día de la planta) sin recorrido', async () => {
      await expect(
        as(observer, () =>
          service.findAvailableEvents({ manufacturingPlantId: 1 }),
        ),
      ).resolves.toHaveLength(1);

      // Hoy en México: 2026-10-20 00:00 a 2026-10-21 00:00 (UTC-6).
      expect(qb().andWhere).toHaveBeenCalledWith(
        'calendar.scheduledAt >= :start',
        {
          start: new Date('2026-10-20T06:00:00Z'),
        },
      );
      expect(qb().andWhere).toHaveBeenCalledWith(
        'calendar.scheduledAt < :end',
        {
          end: new Date('2026-10-21T06:00:00Z'),
        },
      );
    });

    it('en una planta de Colombia usa el día de Bogotá', async () => {
      plants.findOne.mockResolvedValue({
        id: 1,
        country: { name: 'Colombia' },
      } as ManufacturingPlant);

      await as(observer, () =>
        service.findAvailableEvents({ manufacturingPlantId: 1 }),
      );

      expect(qb().andWhere).toHaveBeenCalledWith(
        'calendar.scheduledAt >= :start',
        {
          start: new Date('2026-10-20T05:00:00Z'),
        },
      );
    });

    it('una planta ajena responde 403', async () => {
      await expect(
        as(observer, () =>
          service.findAvailableEvents({ manufacturingPlantId: 2 }),
        ),
      ).rejects.toThrow(
        new ForbiddenException('No tienes acceso a la planta seleccionada'),
      );
    });

    it('una planta inactiva o inexistente responde 404', async () => {
      plants.findOne.mockResolvedValue(null);

      await expect(
        as(observer, () =>
          service.findAvailableEvents({ manufacturingPlantId: 1 }),
        ),
      ).rejects.toThrow(new NotFoundException('Planta con ID 1 no encontrada'));
    });
  });

  describe('start', () => {
    const start = () =>
      as(observer, () => service.start({ gembaWalkCalendarId: 5 }));

    it('devuelve un comprobante firmado con la hora de inicio del servidor', async () => {
      const result = await start();

      expect(result.startedAt).toEqual(NOW);
      const payload = jwt.verify(
        result.startToken,
        `${SECRET}:gemba-walk-start`,
      ) as Record<string, unknown>;
      expect(payload).toMatchObject({
        purpose: 'gemba-walk-start',
        gembaWalkCalendarId: 5,
        userId: 10,
        startedAt: NOW.getTime(),
      });
    });

    it('se puede iniciar antes de la hora programada (mismo día)', async () => {
      calendars.findOne.mockResolvedValue(
        event({ scheduledAt: new Date(NOW.getTime() + 60 * MINUTE) }),
      );

      await expect(start()).resolves.toHaveProperty('startToken');
    });

    it.each([
      ['no existe', () => null],
      [
        'su zona está inactiva',
        () =>
          event({
            gembaWalkZone: {
              ...event().gembaWalkZone,
              isActive: false,
            } as never,
          }),
      ],
    ])('responde 404 si el evento %s', async (_c, found) => {
      calendars.findOne.mockResolvedValue(found());

      await expect(start()).rejects.toThrow(
        new NotFoundException('Evento con ID 5 no encontrado o inactivo'),
      );
    });

    it('un evento de otra planta responde 403', async () => {
      calendars.findOne.mockResolvedValue(
        event({
          gembaWalkZone: {
            ...event().gembaWalkZone,
            manufacturingPlant: { id: 2 },
          } as never,
        }),
      );

      await expect(start()).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('un evento de otro día responde 400', async () => {
      calendars.findOne.mockResolvedValue(
        event({ scheduledAt: new Date('2026-10-19T16:00:00Z') }),
      );

      await expect(start()).rejects.toThrow(
        new BadRequestException(
          'Solo se pueden registrar recorridos de eventos programados para hoy',
        ),
      );
    });

    it('un evento ya registrado responde 400', async () => {
      walks.exists.mockResolvedValue(true);

      await expect(start()).rejects.toThrow(
        new BadRequestException(
          'El evento seleccionado ya tiene un recorrido registrado',
        ),
      );
    });

    it(`después de ${GEMBA_WALK_TOLERANCE_MINUTES} minutos de la hora programada ya no se puede iniciar`, async () => {
      calendars.findOne.mockResolvedValue(
        event({
          scheduledAt: new Date(
            NOW.getTime() - (GEMBA_WALK_TOLERANCE_MINUTES + 1) * MINUTE,
          ),
        }),
      );

      await expect(start()).rejects.toThrow(/Recorrido fuera de tiempo/);
    });
  });

  describe('create', () => {
    const evaluationRows = [
      { id: 1, area: 'Seguridad', category: 'EPP', description: 'Usa casco' },
      { id: 2, area: 'Orden', category: '5S', description: 'Pasillos libres' },
    ] as GembaWalkEvaluation[];
    const token = (
      overrides: object = {},
      secret = `${SECRET}:gemba-walk-start`,
    ) =>
      jwt.sign(
        {
          purpose: 'gemba-walk-start',
          gembaWalkCalendarId: 5,
          userId: 10,
          startedAt: NOW.getTime() - 10 * MINUTE,
          ...overrides,
        },
        secret,
      );
    const results = [
      { gembaWalkEvaluationId: 1, isCompliant: true, comments: '  bien  ' },
      { gembaWalkEvaluationId: 2, isCompliant: false, comments: '   ' },
    ];
    const create = (body: object = {}) =>
      as(observer, () =>
        service.create({
          gembaWalkCalendarId: 5,
          startToken: token(),
          results,
          ...body,
        } as never),
      );

    beforeEach(() => {
      evaluations.find.mockResolvedValue(evaluationRows);
      walks.save.mockImplementation(
        async (walk) => ({ id: 70, ...walk }) as never,
      );
      walks.findOne.mockResolvedValue({
        id: 70,
        gembaWalkCalendar: event(),
      } as never);
    });

    it('guarda el recorrido con su duración y una copia de cada concepto evaluado', async () => {
      await expect(create()).resolves.toMatchObject({ id: 70 });

      const saved = walks.create.mock.calls[0][0] as Record<string, unknown>;
      expect(saved).toMatchObject({
        startedAt: new Date(NOW.getTime() - 10 * MINUTE),
        performedAt: NOW,
        durationSeconds: 600,
        gembaWalkCalendar: { id: 5 },
        createdBy: { id: 10 },
      });
      expect(saved.results).toEqual([
        {
          gembaWalkEvaluation: { id: 1 },
          area: 'Seguridad',
          category: 'EPP',
          description: 'Usa casco',
          isCompliant: true,
          comments: 'bien',
        },
        expect.objectContaining({ isCompliant: false, comments: null }),
      ]);
    });

    it.each([
      [
        'un comprobante firmado con otro secreto',
        { startToken: token({}, 'otro') },
      ],
      ['un comprobante con texto cualquiera', { startToken: 'abc' }],
    ])('responde 400 con %s', async (_c, body) => {
      await expect(create(body)).rejects.toThrow(
        new BadRequestException(
          'El inicio del recorrido no es válido o ya venció. Vuelve a iniciarlo',
        ),
      );
    });

    it.each([
      ['otro propósito', { purpose: 'otro' }],
      ['otro evento', { gembaWalkCalendarId: 6 }],
      ['otro usuario', { userId: 11 }],
    ])('un comprobante de %s responde 400', async (_c, overrides) => {
      await expect(create({ startToken: token(overrides) })).rejects.toThrow(
        new BadRequestException(
          'El inicio del recorrido no corresponde al evento seleccionado',
        ),
      );
    });

    it('un comprobante iniciado fuera de tolerancia responde 400', async () => {
      await expect(
        create({
          startToken: token({
            startedAt: NOW.getTime() + 20 * MINUTE,
          }),
        }),
      ).rejects.toThrow(/Recorrido fuera de tiempo/);
    });

    it('sin conceptos de evaluación en la planta responde 400', async () => {
      evaluations.find.mockResolvedValue([]);

      await expect(create()).rejects.toThrow(
        new BadRequestException(
          'La planta no tiene conceptos de evaluación registrados',
        ),
      );
    });

    it.each([
      ['falta un concepto', [results[0]]],
      ['un concepto repetido', [results[0], results[0]]],
      [
        'un concepto que no es de la planta',
        [results[0], { ...results[1], gembaWalkEvaluationId: 9 }],
      ],
    ])('responde 400 si %s', async (_c, sent) => {
      await expect(create({ results: sent })).rejects.toThrow(
        /Se deben evaluar todos los conceptos vigentes de la planta/,
      );
      expect(walks.save).not.toHaveBeenCalled();
    });

    it('si otra petición registró el mismo evento (índice único) responde 400', async () => {
      walks.save.mockRejectedValue(
        new QueryFailedError(
          'INSERT',
          [],
          Object.assign(new Error('dup'), {
            code: '23505',
          }),
        ),
      );

      await expect(create()).rejects.toThrow(
        new BadRequestException(
          'El evento seleccionado ya tiene un recorrido registrado',
        ),
      );
    });

    it('otros errores de la base se propagan', async () => {
      const error = new Error('conexión perdida');
      walks.save.mockRejectedValue(error);

      await expect(create()).rejects.toBe(error);
    });
  });

  describe('findCalendar', () => {
    const query = {
      manufacturingPlantId: 1,
      startDate: '2026-10-01T00:00:00-06:00',
      endDate: '2026-11-01T00:00:00-06:00',
    };

    it('marca cada evento según quien consulta: hecho, perdido o pendiente', async () => {
      calendars.find.mockResolvedValue([
        event({ id: 1 }),
        event({ id: 2 }),
        event({ id: 3, scheduledAt: new Date(NOW.getTime() - 30 * MINUTE) }),
        event({ id: 4, scheduledAt: new Date(NOW.getTime() + 30 * MINUTE) }),
      ]);
      walks.find.mockResolvedValue([
        { id: 100, gembaWalkCalendar: { id: 1 }, createdBy: { id: 10 } },
        { id: 101, gembaWalkCalendar: { id: 2 }, createdBy: { id: 99 } },
      ] as never);

      const result = await as(observer, () => service.findCalendar(query));

      expect(
        result.map(({ id, status, gembaWalkId }) => [id, status, gembaWalkId]),
      ).toEqual([
        [1, 'DONE', 100],
        [2, 'MISSED', null],
        [3, 'MISSED', null],
        [4, 'PENDING', null],
      ]);
      expect(result[0].gembaWalkZone).toEqual({
        id: 3,
        nameZone: 'Producción',
        nameLocation: 'Línea 1',
      });
    });

    it('el administrador ve como hecho cualquier recorrido registrado', async () => {
      calendars.find.mockResolvedValue([event({ id: 2 })]);
      walks.find.mockResolvedValue([
        { id: 101, gembaWalkCalendar: { id: 2 }, createdBy: { id: 99 } },
      ] as never);

      const [row] = await as(admin, () => service.findCalendar(query));

      expect(row).toMatchObject({ status: 'DONE', gembaWalkId: 101 });
    });

    it('sin eventos no consulta recorridos', async () => {
      calendars.find.mockResolvedValue([]);

      await expect(
        as(observer, () => service.findCalendar(query)),
      ).resolves.toEqual([]);
      expect(walks.find).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    const where = () =>
      walks.find.mock.calls[0][0].where as {
        createdBy?: { id: number };
        gembaWalkCalendar: {
          scheduledAt?: FindOperator<unknown>;
          isAdditional?: boolean;
          gembaWalkZone: Record<string, unknown> & {
            manufacturingPlant: { id: unknown };
          };
        };
      };

    it('el observador solo ve sus recorridos de sus plantas', async () => {
      await as(observer, () => service.findAll({}));

      expect(where().createdBy).toEqual({ id: 10 });
      expect(
        (
          where().gembaWalkCalendar.gembaWalkZone.manufacturingPlant
            .id as FindOperator<number[]>
        ).value,
      ).toEqual([1]);
    });

    it('el administrador ve todos', async () => {
      await as(admin, () => service.findAll({}));

      expect(where()).not.toHaveProperty('createdBy');
    });

    it('aplica filtros de planta, zona, nombres, adicional y rango de fechas', async () => {
      await as(observer, () =>
        service.findAll({
          manufacturingPlantId: 1,
          gembaWalkZoneId: 3,
          nameZone: 'Producción',
          nameLocation: 'Línea 1',
          isAdditional: 'false',
          startDate: '2026-10-01T00:00:00-06:00',
          endDate: '2026-11-01T00:00:00-06:00',
        }),
      );

      const calendar = where().gembaWalkCalendar;
      expect(calendar.gembaWalkZone).toMatchObject({
        id: 3,
        nameZone: 'Producción',
        nameLocation: 'Línea 1',
        manufacturingPlant: { id: 1 },
      });
      expect(calendar.isAdditional).toBe(false);
      expect(calendar.scheduledAt.type).toBe('and');
    });

    it.each([
      [
        'solo inicio',
        { startDate: '2026-10-01T00:00:00-06:00' },
        'moreThanOrEqual',
      ],
      ['solo fin', { endDate: '2026-11-01T00:00:00-06:00' }, 'lessThan'],
    ])('rango con %s', async (_c, dates, type) => {
      await as(observer, () => service.findAll(dates));

      expect(where().gembaWalkCalendar.scheduledAt.type).toBe(type);
    });

    it('una planta ajena responde 403', async () => {
      await expect(
        as(observer, () => service.findAll({ manufacturingPlantId: 2 })),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('paginado: skip/take y total; limit -1 devuelve todo', async () => {
      walks.findAndCount.mockResolvedValue([[{ id: 1 }] as never, 12]);

      await expect(
        as(observer, () => service.findAll({ page: 2, limit: 5 })),
      ).resolves.toEqual({ data: [{ id: 1 }], count: 12 });
      expect(walks.findAndCount.mock.calls[0][0]).toMatchObject({
        take: 5,
        skip: 5,
      });

      await as(observer, () => service.findAll({ page: 1, limit: -1 }));
      expect(walks.findAndCount.mock.calls[1][0]).not.toHaveProperty('take');
    });
  });

  describe('findOne', () => {
    it('el observador ve el detalle de su recorrido', async () => {
      walks.findOne.mockResolvedValue({
        id: 70,
        gembaWalkCalendar: event(),
      } as never);

      await expect(
        as(observer, () => service.findOne(70)),
      ).resolves.toMatchObject({
        id: 70,
      });
      expect(walks.findOne.mock.calls[0][0].where).toMatchObject({
        createdBy: { id: 10 },
      });
    });

    it('uno ajeno o inexistente responde 404', async () => {
      await expect(as(observer, () => service.findOne(70))).rejects.toThrow(
        new NotFoundException('Recorrido con ID 70 no encontrado'),
      );
    });

    it('el de otra planta responde 403', async () => {
      walks.findOne.mockResolvedValue({
        id: 70,
        gembaWalkCalendar: event({
          gembaWalkZone: {
            ...event().gembaWalkZone,
            manufacturingPlant: { id: 2 },
          } as never,
        }),
      } as never);

      await expect(as(admin, () => service.findOne(70))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
