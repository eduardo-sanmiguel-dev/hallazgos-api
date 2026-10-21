import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FindOperator, In } from 'typeorm';

import {
  buildUser,
  createServiceTestingModule,
  RepositoryMock,
  runAsUser,
} from '@test/utils';
import { GembaWalkZone } from 'gemba-walk-zones/entities/gemba-walk-zone.entity';
import { GembaWalkCalendar } from './entities/gemba-walk-calendar.entity';
import { GembaWalkCalendarService } from './gemba-walk-calendar.service';

const NOW = new Date('2026-10-20T16:00:00Z');
const HOUR = 60 * 60 * 1000;
const at = (hoursFromNow: number) =>
  new Date(NOW.getTime() + hoursFromNow * HOUR);

describe('GembaWalkCalendarService', () => {
  let service: GembaWalkCalendarService;
  let calendars: RepositoryMock<GembaWalkCalendar>;
  let zones: RepositoryMock<GembaWalkZone>;
  const user = buildUser({
    id: 10,
    manufacturingPlants: [{ id: 1 }, { id: 2 }] as never,
  });
  const as = <T>(fn: () => Promise<T>) => runAsUser(user, fn);

  const stored = (overrides: Partial<GembaWalkCalendar> = {}) =>
    ({
      id: 1,
      isActive: true,
      isAdditional: false,
      scheduledAt: at(24),
      gembaWalkZone: { id: 3, nameZone: 'Producción', nameLocation: 'L1' },
      ...overrides,
    }) as GembaWalkCalendar;

  beforeEach(async () => {
    const testing = await createServiceTestingModule(GembaWalkCalendarService, {
      repositories: [GembaWalkCalendar, GembaWalkZone],
    });
    service = testing.service;
    calendars = testing.repository(GembaWalkCalendar);
    zones = testing.repository(GembaWalkZone);

    zones.find.mockImplementation(async ({ where }) =>
      (operand((where as { id: unknown }).id) as number[]).map(
        (id) => ({ id }) as GembaWalkZone,
      ),
    );
    calendars.save.mockImplementation(
      async (rows) =>
        (rows as GembaWalkCalendar[]).map((row, i) => ({
          id: 100 + i,
          ...row,
        })) as never,
    );

    jest.useFakeTimers({
      now: NOW,
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });
  });

  afterEach(() => jest.useRealTimers());

  const operand = (value: unknown) => (value as FindOperator<unknown>).value;

  describe('create', () => {
    const create = (events: object[]) =>
      as(() => service.create({ events } as never));

    it('crea un evento por cada elemento, en una sola transacción', async () => {
      await create([
        { gembaWalkZoneId: 3, scheduledAt: at(24).toISOString() },
        {
          gembaWalkZoneId: 4,
          scheduledAt: at(48).toISOString(),
          isAdditional: true,
        },
      ]);

      expect(calendars.save).toHaveBeenCalledTimes(1);
      expect(calendars.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          scheduledAt: at(24),
          isAdditional: false,
          gembaWalkZone: { id: 3 },
          createdBy: { id: 10 },
        }),
      );
      expect(calendars.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          isAdditional: true,
        }),
      );
      // Devuelve los eventos guardados recién leídos.
      expect(
        operand(
          (calendars.find.mock.calls.at(-1)[0].where as { id: unknown }).id,
        ),
      ).toEqual([100, 101]);
    });

    it('una zona inexistente o inactiva responde 400 con sus ids', async () => {
      zones.find.mockResolvedValue([{ id: 3 }] as GembaWalkZone[]);

      await expect(
        create([
          { gembaWalkZoneId: 3, scheduledAt: at(24).toISOString() },
          { gembaWalkZoneId: 8, scheduledAt: at(24).toISOString() },
          { gembaWalkZoneId: 9, scheduledAt: at(24).toISOString() },
        ]),
      ).rejects.toThrow(
        new BadRequestException(
          'Zona(s) con ID 8, 9 no encontrada(s) o inactiva(s)',
        ),
      );
    });

    it('no se programan eventos en el pasado (ni a la hora actual)', async () => {
      await expect(
        create([{ gembaWalkZoneId: 3, scheduledAt: NOW.toISOString() }]),
      ).rejects.toThrow(
        new BadRequestException(
          'No se pueden programar eventos en una fecha y hora pasada',
        ),
      );
    });

    it('dos eventos iguales (zona, fecha y hora) en la petición responden 400', async () => {
      const event = { gembaWalkZoneId: 3, scheduledAt: at(24).toISOString() };

      await expect(create([event, event])).rejects.toThrow(
        new BadRequestException(
          'Hay eventos repetidos para la misma zona, fecha y hora',
        ),
      );
    });

    it('un evento que ya existe responde 400 con su detalle', async () => {
      calendars.find.mockResolvedValueOnce([stored()]);

      await expect(
        create([{ gembaWalkZoneId: 3, scheduledAt: at(24).toISOString() }]),
      ).rejects.toThrow(
        `Ya existen eventos para la misma zona, fecha y hora: Producción - L1 (${at(24).toISOString()})`,
      );
      expect(calendars.save).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    const where = () =>
      calendars.find.mock.calls[0][0].where as Record<string, unknown> & {
        scheduledAt?: FindOperator<unknown>;
      };

    it('sin filtros: eventos activos de zonas y plantas activas, por fecha', async () => {
      await as(async () => service.findAll({}));

      expect(where()).toEqual({
        isActive: true,
        gembaWalkZone: {
          isActive: true,
          manufacturingPlant: { isActive: true, id: In([1, 2]) },
        },
      });
      expect(calendars.find.mock.calls[0][0].order).toEqual({
        scheduledAt: 'ASC',
      });
    });

    it('filtra por planta, zona, adicional y rango', async () => {
      await as(async () =>
        service.findAll({
          manufacturingPlantId: 1,
          gembaWalkZoneId: 3,
          isAdditional: 'true',
          startDate: '2026-10-01T00:00:00Z',
          endDate: '2026-11-01T00:00:00Z',
        }),
      );

      expect(where()).toMatchObject({
        isAdditional: true,
        gembaWalkZone: { id: 3, manufacturingPlant: { id: In([1]) } },
      });
      expect(where().scheduledAt.type).toBe('and');
    });

    it.each([
      [{ startDate: '2026-10-01T00:00:00Z' }, 'moreThanOrEqual'],
      [{ endDate: '2026-11-01T00:00:00Z' }, 'lessThan'],
    ])('rango parcial %o', async (dates, type) => {
      await as(async () => service.findAll(dates));

      expect(where().scheduledAt.type).toBe(type);
    });

    it('con page y limit responde paginado', async () => {
      calendars.findAndCount.mockResolvedValue([[stored()], 1]);

      await expect(
        as(async () => service.findAll({ page: 1, limit: 10 })),
      ).resolves.toMatchObject({
        count: 1,
      });
    });
  });

  describe('findOne', () => {
    it('devuelve el evento', async () => {
      calendars.findOne.mockResolvedValue(stored());

      await expect(as(async () => service.findOne(1))).resolves.toMatchObject({
        id: 1,
      });
    });

    it('inexistente responde 404', async () => {
      await expect(as(async () => service.findOne(1))).rejects.toThrow(
        new NotFoundException('Evento con ID 1 no encontrado'),
      );
    });

    it('inactivo responde 400 (salvo que se pida incluirlo)', async () => {
      calendars.findOne.mockResolvedValue(stored({ isActive: false }));

      await expect(as(async () => service.findOne(1))).rejects.toThrow(
        new BadRequestException('El evento con ID 1 esta inactivo'),
      );
      await expect(
        as(async () => service.findOne(1, false)),
      ).resolves.toMatchObject({ id: 1 });
    });
  });

  describe('update', () => {
    const update = (events: object[]) =>
      as(() => service.update({ events } as never));

    beforeEach(() => {
      calendars.find.mockResolvedValueOnce([
        stored({ id: 1 }),
        stored({ id: 2, scheduledAt: at(48), isAdditional: true }),
      ]);
    });

    it('cambia solo lo enviado y conserva el resto de cada evento', async () => {
      calendars.find.mockResolvedValueOnce([]); // sin choques

      await update([
        { id: 1, scheduledAt: at(30).toISOString() },
        { id: 2, gembaWalkZoneId: 7 },
      ]);

      expect(calendars.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          id: 1,
          scheduledAt: at(30),
          gembaWalkZone: { id: 3 },
          isAdditional: false,
          updatedBy: { id: 10 },
        }),
      );
      expect(calendars.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          id: 2,
          scheduledAt: at(48),
          gembaWalkZone: { id: 7 },
          isAdditional: true,
        }),
      );
      // Al buscar choques se excluyen los propios eventos.
      const conflictWhere = calendars.find.mock.calls[1][0].where as {
        id: unknown;
      }[];
      expect((conflictWhere[0].id as FindOperator<unknown>).type).toBe('not');
      // TypeORM aplana el valor de Not(In(...)).
      expect(operand(conflictWhere[0].id)).toEqual([1, 2]);
    });

    it('ids repetidos en la petición responden 400', async () => {
      await expect(update([{ id: 1 }, { id: 1 }])).rejects.toThrow(
        new BadRequestException('Hay eventos repetidos en la petición'),
      );
    });

    it('un evento inexistente o inactivo responde 404', async () => {
      await expect(update([{ id: 1 }, { id: 9 }])).rejects.toThrow(
        new NotFoundException(
          'Evento(s) con ID 9 no encontrado(s) o inactivo(s)',
        ),
      );
    });

    it('no se editan eventos pasados', async () => {
      calendars.find.mockReset();
      calendars.find.mockResolvedValueOnce([
        stored({ id: 1, scheduledAt: at(-1) }),
      ]);

      await expect(update([{ id: 1 }])).rejects.toThrow(
        new BadRequestException('No se pueden editar eventos pasados (ID 1)'),
      );
    });
  });

  describe('remove', () => {
    it('desactiva un evento futuro', async () => {
      calendars.findOne.mockResolvedValue(stored());
      calendars.save.mockImplementation(async (row) => row as never);

      await expect(as(() => service.remove(1))).resolves.toMatchObject({
        isActive: false,
        updatedBy: { id: 10 },
      });
    });

    it('no se eliminan eventos pasados', async () => {
      calendars.findOne.mockResolvedValue(stored({ scheduledAt: at(-1) }));

      await expect(as(() => service.remove(1))).rejects.toThrow(
        new BadRequestException('No se pueden eliminar eventos pasados (ID 1)'),
      );
    });
  });
});
