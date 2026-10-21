import { InjectRepository } from '@nestjs/typeorm';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RequestContextService } from 'shared/services/request-context.service';

import {
  FindManyOptions,
  And,
  FindOptionsWhere,
  In,
  LessThan,
  MoreThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
import { findPaginated, scopePlantIds } from 'shared/utils';

import {
  CreateGembaWalkCalendarDto,
  QueryGembaWalkCalendarDto,
  UpdateGembaWalkCalendarDto,
} from './dto';
import { GembaWalkCalendar } from './entities/gemba-walk-calendar.entity';
import { GembaWalkZone } from 'gemba-walk-zones/entities/gemba-walk-zone.entity';
import { User } from 'users/entities/user.entity';

interface EventSlot {
  id?: number;
  gembaWalkZoneId: number;
  scheduledAt: Date;
  isAdditional: boolean;
}

@Injectable()
export class GembaWalkCalendarService {
  private readonly relations = [
    'createdBy',
    'updatedBy',
    'gembaWalkZone',
    'gembaWalkZone.manufacturingPlant',
  ];

  constructor(
    @InjectRepository(GembaWalkCalendar)
    private readonly gembaWalkCalendarRepository: Repository<GembaWalkCalendar>,
    @InjectRepository(GembaWalkZone)
    private readonly gembaWalkZoneRepository: Repository<GembaWalkZone>,
    private readonly requestContext: RequestContextService,
  ) {}

  private async validateZones(gembaWalkZoneIds: number[]) {
    const uniqueIds = [...new Set(gembaWalkZoneIds)];

    const zones = await this.gembaWalkZoneRepository.find({
      where: {
        id: In(uniqueIds),
        isActive: true,
        manufacturingPlant: {
          isActive: true,
          id: In(this.requestContext.manufacturingPlantIds),
        },
      },
    });

    const missingIds = uniqueIds.filter(
      (zoneId) => !zones.some((zone) => zone.id === zoneId),
    );

    if (missingIds.length) {
      throw new BadRequestException(
        `Zona(s) con ID ${missingIds.join(', ')} no encontrada(s) o inactiva(s)`,
      );
    }
  }

  // No se programan eventos en el pasado.
  private validateFutureSlots(slots: EventSlot[]) {
    const now = Date.now();

    if (slots.some(({ scheduledAt }) => scheduledAt.getTime() <= now)) {
      throw new BadRequestException(
        'No se pueden programar eventos en una fecha y hora pasada',
      );
    }
  }

  // Una zona no puede tener dos eventos activos a la misma fecha y hora.
  private async validateUniqueSlots(slots: EventSlot[]) {
    const keys = new Set<string>();

    for (const { gembaWalkZoneId, scheduledAt } of slots) {
      const key = `${gembaWalkZoneId}|${scheduledAt.getTime()}`;

      if (keys.has(key)) {
        throw new BadRequestException(
          'Hay eventos repetidos para la misma zona, fecha y hora',
        );
      }

      keys.add(key);
    }

    const excludeIds = slots.filter(({ id }) => id).map(({ id }) => id);

    const existing = await this.gembaWalkCalendarRepository.find({
      where: slots.map(({ gembaWalkZoneId, scheduledAt }) => ({
        isActive: true,
        gembaWalkZone: { id: gembaWalkZoneId },
        scheduledAt,
        ...(excludeIds.length && { id: Not(In(excludeIds)) }),
      })),
      relations: ['gembaWalkZone'],
    });

    if (existing.length) {
      const detail = existing
        .map(
          ({ gembaWalkZone, scheduledAt }) =>
            `${gembaWalkZone.nameZone} - ${gembaWalkZone.nameLocation} (${scheduledAt.toISOString()})`,
        )
        .join(', ');

      throw new BadRequestException(
        `Ya existen eventos para la misma zona, fecha y hora: ${detail}`,
      );
    }
  }

  async create(
    createGembaWalkCalendarDto: CreateGembaWalkCalendarDto,
  ): Promise<GembaWalkCalendar[]> {
    const createdBy = this.requestContext.userId;

    const slots: EventSlot[] = createGembaWalkCalendarDto.events.map(
      ({ gembaWalkZoneId, scheduledAt, isAdditional = false }) => ({
        gembaWalkZoneId,
        scheduledAt: new Date(scheduledAt),
        isAdditional,
      }),
    );

    await this.validateZones(
      slots.map(({ gembaWalkZoneId }) => gembaWalkZoneId),
    );
    this.validateFutureSlots(slots);
    await this.validateUniqueSlots(slots);

    const gembaWalkCalendars = slots.map(
      ({ gembaWalkZoneId, scheduledAt, isAdditional }) =>
        this.gembaWalkCalendarRepository.create({
          scheduledAt,
          isAdditional,
          gembaWalkZone: { id: gembaWalkZoneId },
          createdBy: { id: createdBy } as User,
          createdAt: new Date(),
        }),
    );

    // save() con arreglo corre en una sola transacción.
    const saved =
      await this.gembaWalkCalendarRepository.save(gembaWalkCalendars);

    return this.findByIds(saved.map(({ id }) => id));
  }

  async findAll(queryGembaWalkCalendarDto: QueryGembaWalkCalendarDto) {
    const { page, limit, isAdditional } = queryGembaWalkCalendarDto;
    const { manufacturingPlantId, gembaWalkZoneId, startDate, endDate } =
      queryGembaWalkCalendarDto;

    const where: FindOptionsWhere<GembaWalkCalendar> = {
      isActive: true,
      ...(isAdditional !== undefined && {
        isAdditional: String(isAdditional) === 'true',
      }),
      gembaWalkZone: {
        isActive: true,
        ...(gembaWalkZoneId && { id: gembaWalkZoneId }),
        manufacturingPlant: {
          isActive: true,
          id: In(
            scopePlantIds(
              this.requestContext.user.manufacturingPlants,
              manufacturingPlantId,
            ),
          ),
        },
      },
    };

    if (startDate && endDate) {
      where.scheduledAt = And(
        MoreThanOrEqual(new Date(startDate)),
        LessThan(new Date(endDate)),
      );
    } else if (startDate) {
      where.scheduledAt = MoreThanOrEqual(new Date(startDate));
    } else if (endDate) {
      where.scheduledAt = LessThan(new Date(endDate));
    }

    const options: FindManyOptions<GembaWalkCalendar> = {
      where,
      relations: this.relations,
      order: {
        scheduledAt: 'ASC',
      },
    };

    return page && limit
      ? findPaginated(this.gembaWalkCalendarRepository, options, page, limit)
      : this.gembaWalkCalendarRepository.find(options);
  }

  async findOne(id: number, isActive = true): Promise<GembaWalkCalendar> {
    const gembaWalkCalendar = await this.gembaWalkCalendarRepository.findOne({
      where: {
        id,
        gembaWalkZone: {
          manufacturingPlant: {
            id: In(this.requestContext.manufacturingPlantIds),
          },
        },
      },
      relations: this.relations,
    });

    if (!gembaWalkCalendar) {
      throw new NotFoundException(`Evento con ID ${id} no encontrado`);
    }

    if (isActive && !gembaWalkCalendar.isActive) {
      throw new BadRequestException(`El evento con ID ${id} esta inactivo`);
    }

    return gembaWalkCalendar;
  }

  async update(
    updateGembaWalkCalendarDto: UpdateGembaWalkCalendarDto,
  ): Promise<GembaWalkCalendar[]> {
    const updatedBy = this.requestContext.userId;
    const { events } = updateGembaWalkCalendarDto;
    const ids = events.map(({ id }) => id);

    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Hay eventos repetidos en la petición');
    }

    const currents = await this.gembaWalkCalendarRepository.find({
      where: { id: In(ids), isActive: true },
      relations: ['gembaWalkZone'],
    });

    const missingIds = ids.filter(
      (id) => !currents.some((current) => current.id === id),
    );

    if (missingIds.length) {
      throw new NotFoundException(
        `Evento(s) con ID ${missingIds.join(', ')} no encontrado(s) o inactivo(s)`,
      );
    }

    const pastIds = currents
      .filter(({ scheduledAt }) => scheduledAt.getTime() <= Date.now())
      .map(({ id }) => id);

    if (pastIds.length) {
      throw new BadRequestException(
        `No se pueden editar eventos pasados (ID ${pastIds.join(', ')})`,
      );
    }

    const slots: EventSlot[] = events.map((event) => {
      const current = currents.find(({ id }) => id === event.id);

      return {
        id: event.id,
        gembaWalkZoneId: event.gembaWalkZoneId || current.gembaWalkZone.id,
        scheduledAt: event.scheduledAt
          ? new Date(event.scheduledAt)
          : current.scheduledAt,
        isAdditional: event.isAdditional ?? current.isAdditional,
      };
    });

    await this.validateZones(
      slots.map(({ gembaWalkZoneId }) => gembaWalkZoneId),
    );
    this.validateFutureSlots(slots);
    await this.validateUniqueSlots(slots);

    const gembaWalkCalendars = slots.map(
      ({ id, gembaWalkZoneId, scheduledAt, isAdditional }) =>
        this.gembaWalkCalendarRepository.create({
          id,
          scheduledAt,
          isAdditional,
          gembaWalkZone: { id: gembaWalkZoneId },
          updatedBy: { id: updatedBy } as User,
          updatedAt: new Date(),
        }),
    );

    await this.gembaWalkCalendarRepository.save(gembaWalkCalendars);

    return this.findByIds(ids);
  }

  async remove(id: number): Promise<GembaWalkCalendar> {
    const updatedBy = this.requestContext.userId;
    const gembaWalkCalendar = await this.findOne(id);

    if (gembaWalkCalendar.scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        `No se pueden eliminar eventos pasados (ID ${id})`,
      );
    }

    gembaWalkCalendar.isActive = false;
    gembaWalkCalendar.updatedBy = { id: updatedBy } as User;
    gembaWalkCalendar.updatedAt = new Date();

    return this.gembaWalkCalendarRepository.save(gembaWalkCalendar);
  }

  private findByIds(ids: number[]): Promise<GembaWalkCalendar[]> {
    return this.gembaWalkCalendarRepository.find({
      where: {
        id: In(ids),
        gembaWalkZone: {
          manufacturingPlant: {
            id: In(this.requestContext.manufacturingPlantIds),
          },
        },
      },
      relations: this.relations,
      order: {
        scheduledAt: 'ASC',
      },
    });
  }
}
