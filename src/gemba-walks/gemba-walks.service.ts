import { InjectRepository } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RequestContextService } from 'shared/services/request-context.service';

import {
  And,
  FindManyOptions,
  FindOptionsWhere,
  In,
  LessThan,
  MoreThanOrEqual,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

import {
  CreateGembaWalkDto,
  QueryAvailableEventsDto,
  QueryGembaWalkDto,
  QueryWalkCalendarDto,
  StartGembaWalkDto,
} from './dto';
import { GembaWalk } from './entities/gemba-walk.entity';
import { GembaWalkResult } from './entities/gemba-walk-result.entity';
import { GembaWalkCalendar } from 'gemba-walk-calendar/entities/gemba-walk-calendar.entity';
import { GembaWalkEvaluation } from 'gemba-walk-evaluations/entities/gemba-walk-evaluation.entity';
import { GembaWalkObserver } from 'gemba-walk-observers/entities/gemba-walk-observer.entity';
import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { User } from 'users/entities/user.entity';
import {
  PLANT_TIME_ZONES,
  toPlantCountry,
  toWallClock,
  wallClockToInstant,
} from '@shared/utils';

const UNIQUE_VIOLATION = '23505';

// Minutos de tolerancia después de la hora programada para INICIAR el
// recorrido (puede terminar después). Antes de la hora se permite, siempre que
// sea el mismo día.
export const GEMBA_WALK_TOLERANCE_MINUTES = 15;

// Comprobante firmado con la hora de inicio que fija el servidor.
interface StartTokenPayload {
  purpose: 'gemba-walk-start';
  gembaWalkCalendarId: number;
  userId: number;
  startedAt: number;
}

@Injectable()
export class GembaWalksService {
  private readonly relations = [
    'createdBy',
    'gembaWalkCalendar',
    'gembaWalkCalendar.gembaWalkZone',
    'gembaWalkCalendar.gembaWalkZone.manufacturingPlant',
  ];

  constructor(
    @InjectRepository(GembaWalk)
    private readonly gembaWalkRepository: Repository<GembaWalk>,
    @InjectRepository(GembaWalkCalendar)
    private readonly gembaWalkCalendarRepository: Repository<GembaWalkCalendar>,
    @InjectRepository(GembaWalkEvaluation)
    private readonly gembaWalkEvaluationRepository: Repository<GembaWalkEvaluation>,
    @InjectRepository(GembaWalkObserver)
    private readonly gembaWalkObserverRepository: Repository<GembaWalkObserver>,
    @InjectRepository(ManufacturingPlant)
    private readonly manufacturingPlantRepository: Repository<ManufacturingPlant>,
    private readonly requestContext: RequestContextService,
    private readonly configService: ConfigService,
  ) {}

  // Secreto propio (derivado del de sesión) para que el comprobante de inicio
  // no sirva como token de sesión ni al revés.
  private get startTokenSecret(): string {
    return `${this.configService.get<string>('jwt.secretKey')}:gemba-walk-start`;
  }

  // Solo los usuarios registrados como observadores activos usan el módulo.
  // El administrador tiene acceso completo aunque no esté registrado.
  async isObserver(): Promise<boolean> {
    if (this.requestContext.isAdmin) return true;

    const count = await this.gembaWalkObserverRepository.count({
      where: {
        isActive: true,
        user: { id: this.requestContext.user.id },
        gembaWalkZone: { isActive: true },
        manufacturingPlant: { isActive: true },
      },
    });

    return count > 0;
  }

  private async assertObserver() {
    if (!(await this.isObserver())) {
      throw new ForbiddenException(
        'Solo los observadores de Gemba Walk pueden acceder a este módulo',
      );
    }
  }

  private assertUserPlant(manufacturingPlantId: number) {
    if (
      !this.requestContext.manufacturingPlantIds.includes(manufacturingPlantId)
    ) {
      throw new ForbiddenException('No tienes acceso a la planta seleccionada');
    }
  }

  // Rango [inicio, fin) del día actual en la zona horaria de la planta.
  private async todayRangeForPlant(manufacturingPlantId: number) {
    const manufacturingPlant = await this.manufacturingPlantRepository.findOne({
      where: { id: manufacturingPlantId, isActive: true },
      relations: ['country'],
    });

    if (!manufacturingPlant) {
      throw new NotFoundException(
        `Planta con ID ${manufacturingPlantId} no encontrada`,
      );
    }

    const timeZone =
      PLANT_TIME_ZONES[toPlantCountry(manufacturingPlant.country?.name)];
    const today = toWallClock(new Date(), timeZone);
    const tomorrow = new Date(
      Date.UTC(today.year, today.month - 1, today.day + 1),
    );
    const midnight = { hour: 0, minute: 0, second: 0 };

    return {
      start: wallClockToInstant({ ...today, ...midnight }, timeZone),
      end: wallClockToInstant(
        {
          year: tomorrow.getUTCFullYear(),
          month: tomorrow.getUTCMonth() + 1,
          day: tomorrow.getUTCDate(),
          ...midnight,
        },
        timeZone,
      ),
    };
  }

  async access() {
    return { isObserver: await this.isObserver() };
  }

  // Eventos de hoy de la planta que aún no tienen recorrido registrado.
  async findAvailableEvents({
    manufacturingPlantId,
  }: QueryAvailableEventsDto): Promise<GembaWalkCalendar[]> {
    await this.assertObserver();
    this.assertUserPlant(manufacturingPlantId);

    const { start, end } = await this.todayRangeForPlant(manufacturingPlantId);

    return this.gembaWalkCalendarRepository
      .createQueryBuilder('calendar')
      .innerJoinAndSelect('calendar.gembaWalkZone', 'zone')
      .innerJoinAndSelect('zone.manufacturingPlant', 'plant')
      .where('calendar.isActive = true')
      .andWhere('zone.isActive = true')
      .andWhere('plant.id = :manufacturingPlantId', { manufacturingPlantId })
      .andWhere('calendar.scheduledAt >= :start', { start })
      .andWhere('calendar.scheduledAt < :end', { end })
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM gemba_walks walk WHERE walk."gembaWalkCalendarId" = calendar.id)',
      )
      .orderBy('calendar.scheduledAt', 'ASC')
      .getMany();
  }

  // Evento activo de hoy (zona horaria de la planta), de una planta del
  // usuario y sin recorrido registrado.
  private async findRegistrableEvent(gembaWalkCalendarId: number) {
    const gembaWalkCalendar = await this.gembaWalkCalendarRepository.findOne({
      where: { id: gembaWalkCalendarId, isActive: true },
      relations: ['gembaWalkZone', 'gembaWalkZone.manufacturingPlant'],
    });

    if (!gembaWalkCalendar || !gembaWalkCalendar.gembaWalkZone.isActive) {
      throw new NotFoundException(
        `Evento con ID ${gembaWalkCalendarId} no encontrado o inactivo`,
      );
    }

    const manufacturingPlantId =
      gembaWalkCalendar.gembaWalkZone.manufacturingPlant.id;

    this.assertUserPlant(manufacturingPlantId);

    const { start, end } = await this.todayRangeForPlant(manufacturingPlantId);
    const scheduledAt = gembaWalkCalendar.scheduledAt.getTime();

    if (scheduledAt < start.getTime() || scheduledAt >= end.getTime()) {
      throw new BadRequestException(
        'Solo se pueden registrar recorridos de eventos programados para hoy',
      );
    }

    const alreadyRegistered = await this.gembaWalkRepository.exists({
      where: { gembaWalkCalendar: { id: gembaWalkCalendarId } },
    });

    if (alreadyRegistered) {
      throw new BadRequestException(
        'El evento seleccionado ya tiene un recorrido registrado',
      );
    }

    return { gembaWalkCalendar, manufacturingPlantId };
  }

  private assertStartOnTime(
    gembaWalkCalendar: GembaWalkCalendar,
    startedAt: number,
  ) {
    const deadline =
      gembaWalkCalendar.scheduledAt.getTime() +
      GEMBA_WALK_TOLERANCE_MINUTES * 60_000;

    if (startedAt > deadline) {
      throw new BadRequestException(
        `Recorrido fuera de tiempo: se debe iniciar a más tardar ${GEMBA_WALK_TOLERANCE_MINUTES} minutos después de la hora programada`,
      );
    }
  }

  // Inicia el recorrido: valida la tolerancia y fija la hora de inicio.
  async start({ gembaWalkCalendarId }: StartGembaWalkDto) {
    await this.assertObserver();

    const { gembaWalkCalendar } =
      await this.findRegistrableEvent(gembaWalkCalendarId);

    const startedAt = Date.now();
    this.assertStartOnTime(gembaWalkCalendar, startedAt);

    const payload: StartTokenPayload = {
      purpose: 'gemba-walk-start',
      gembaWalkCalendarId,
      userId: this.requestContext.user.id,
      startedAt,
    };

    return {
      startToken: jwt.sign(payload, this.startTokenSecret, {
        algorithm: 'HS256',
        expiresIn: '24h',
      }),
      startedAt: new Date(startedAt),
    };
  }

  async create(createGembaWalkDto: CreateGembaWalkDto): Promise<GembaWalk> {
    await this.assertObserver();

    const { gembaWalkCalendarId, startToken, results } = createGembaWalkDto;

    let payload: StartTokenPayload;

    try {
      payload = jwt.verify(startToken, this.startTokenSecret, {
        algorithms: ['HS256'],
      }) as unknown as StartTokenPayload;
    } catch {
      throw new BadRequestException(
        'El inicio del recorrido no es válido o ya venció. Vuelve a iniciarlo',
      );
    }

    if (
      payload.purpose !== 'gemba-walk-start' ||
      payload.gembaWalkCalendarId !== gembaWalkCalendarId ||
      payload.userId !== this.requestContext.user.id
    ) {
      throw new BadRequestException(
        'El inicio del recorrido no corresponde al evento seleccionado',
      );
    }

    const { gembaWalkCalendar, manufacturingPlantId } =
      await this.findRegistrableEvent(gembaWalkCalendarId);

    this.assertStartOnTime(gembaWalkCalendar, payload.startedAt);

    // Se deben evaluar exactamente los conceptos activos de la planta.
    const evaluations = await this.gembaWalkEvaluationRepository.find({
      where: {
        isActive: true,
        manufacturingPlant: { id: manufacturingPlantId },
      },
      order: { id: 'ASC' },
    });

    if (!evaluations.length) {
      throw new BadRequestException(
        'La planta no tiene conceptos de evaluación registrados',
      );
    }

    const resultsByEvaluation = new Map(
      results.map((result) => [result.gembaWalkEvaluationId, result]),
    );

    const isSameSet =
      resultsByEvaluation.size === results.length &&
      results.length === evaluations.length &&
      evaluations.every(({ id }) => resultsByEvaluation.has(id));

    if (!isSameSet) {
      throw new BadRequestException(
        'Se deben evaluar todos los conceptos vigentes de la planta. Recarga la página e intenta de nuevo',
      );
    }

    const performedAt = new Date();

    const gembaWalk = this.gembaWalkRepository.create({
      startedAt: new Date(payload.startedAt),
      performedAt,
      durationSeconds: Math.max(
        0,
        Math.round((performedAt.getTime() - payload.startedAt) / 1000),
      ),
      gembaWalkCalendar: { id: gembaWalkCalendarId },
      createdBy: { id: this.requestContext.user.id } as User,
      createdAt: new Date(),
      results: evaluations.map((evaluation) => {
        const result = resultsByEvaluation.get(evaluation.id);

        return {
          gembaWalkEvaluation: { id: evaluation.id },
          area: evaluation.area,
          category: evaluation.category,
          description: evaluation.description,
          isCompliant: result.isCompliant,
          comments: result.comments?.trim() || null,
        } as GembaWalkResult;
      }),
    });

    try {
      // save() con cascade inserta el recorrido y sus resultados en una transacción.
      const saved = await this.gembaWalkRepository.save(gembaWalk);
      return this.findOne(saved.id);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string })?.code === UNIQUE_VIOLATION
      ) {
        throw new BadRequestException(
          'El evento seleccionado ya tiene un recorrido registrado',
        );
      }

      throw error;
    }
  }

  // Calendario informativo para observadores, desde la perspectiva del
  // observador que consulta:
  // - DONE: el recorrido lo registró él (incluye el ID para ver el detalle).
  // - MISSED: no lo realizó él (lo registró otro observador o ya venció la
  //   tolerancia para iniciarlo sin que nadie lo hiciera).
  // - PENDING: aún se puede iniciar.
  // El administrador ve como DONE cualquier recorrido registrado.
  async findCalendar({
    manufacturingPlantId,
    startDate,
    endDate,
  }: QueryWalkCalendarDto) {
    await this.assertObserver();
    this.assertUserPlant(manufacturingPlantId);

    const events = await this.gembaWalkCalendarRepository.find({
      where: {
        isActive: true,
        scheduledAt: And(
          MoreThanOrEqual(new Date(startDate)),
          LessThan(new Date(endDate)),
        ),
        gembaWalkZone: {
          isActive: true,
          manufacturingPlant: { id: manufacturingPlantId },
        },
      },
      relations: ['gembaWalkZone'],
      order: { scheduledAt: 'ASC' },
    });

    const walks = events.length
      ? await this.gembaWalkRepository.find({
          where: {
            gembaWalkCalendar: { id: In(events.map(({ id }) => id)) },
          },
          relations: ['gembaWalkCalendar', 'createdBy'],
        })
      : [];

    const walkByEvent = new Map(
      walks.map((walk) => [walk.gembaWalkCalendar.id, walk]),
    );
    const now = Date.now();

    return events.map((event) => ({
      id: event.id,
      scheduledAt: event.scheduledAt,
      isAdditional: event.isAdditional,
      gembaWalkZone: {
        id: event.gembaWalkZone.id,
        nameZone: event.gembaWalkZone.nameZone,
        nameLocation: event.gembaWalkZone.nameLocation,
      },
      ...this.calendarStatus(event, walkByEvent.get(event.id), now),
    }));
  }

  private calendarStatus(
    event: GembaWalkCalendar,
    walk: GembaWalk | undefined,
    now: number,
  ): {
    status: 'DONE' | 'MISSED' | 'PENDING';
    gembaWalkId: number | null;
  } {
    if (walk) {
      return this.requestContext.isAdmin ||
        walk.createdBy?.id === this.requestContext.user.id
        ? { status: 'DONE', gembaWalkId: walk.id }
        : { status: 'MISSED', gembaWalkId: null };
    }

    const deadline =
      event.scheduledAt.getTime() + GEMBA_WALK_TOLERANCE_MINUTES * 60_000;

    return {
      status: now > deadline ? 'MISSED' : 'PENDING',
      gembaWalkId: null,
    };
  }

  async findAll(
    queryGembaWalkDto: QueryGembaWalkDto,
  ): Promise<GembaWalk[] | { data: GembaWalk[]; count: number }> {
    await this.assertObserver();

    const {
      manufacturingPlantId,
      gembaWalkZoneId,
      startDate,
      endDate,
      nameZone,
      nameLocation,
      isAdditional,
      page,
      limit,
    } = queryGembaWalkDto;

    if (manufacturingPlantId) {
      this.assertUserPlant(manufacturingPlantId);
    }

    const calendarWhere: FindOptionsWhere<GembaWalkCalendar> = {
      gembaWalkZone: {
        ...(gembaWalkZoneId && { id: gembaWalkZoneId }),
        ...(nameZone && { nameZone }),
        ...(nameLocation && { nameLocation }),
        manufacturingPlant: {
          id:
            manufacturingPlantId ||
            In(this.requestContext.manufacturingPlantIds),
        },
      },
      ...(isAdditional !== undefined && {
        isAdditional: String(isAdditional) === 'true',
      }),
    };

    if (startDate && endDate) {
      calendarWhere.scheduledAt = And(
        MoreThanOrEqual(new Date(startDate)),
        LessThan(new Date(endDate)),
      );
    } else if (startDate) {
      calendarWhere.scheduledAt = MoreThanOrEqual(new Date(startDate));
    } else if (endDate) {
      calendarWhere.scheduledAt = LessThan(new Date(endDate));
    }

    const options = {
      // Cada observador solo ve los recorridos que él registró; el
      // administrador ve todos.
      where: {
        isActive: true,
        ...(!this.requestContext.isAdmin && {
          createdBy: { id: this.requestContext.user.id },
        }),
        gembaWalkCalendar: calendarWhere,
      },
      relations: [...this.relations, 'results'],
      order: { performedAt: 'DESC', id: 'DESC' },
    } satisfies FindManyOptions<GembaWalk>;

    if (page === undefined || limit === undefined) {
      return this.gembaWalkRepository.find(options);
    }

    const limitNumber = Number(limit);

    const [data, count] = await this.gembaWalkRepository.findAndCount({
      ...options,
      ...(limitNumber !== -1 && {
        take: limitNumber,
        skip: (Number(page) - 1) * limitNumber,
      }),
    });

    return { data, count };
  }

  async findOne(id: number): Promise<GembaWalk> {
    await this.assertObserver();

    const gembaWalk = await this.gembaWalkRepository.findOne({
      // Solo el observador que lo registró (o el administrador) ve el detalle.
      where: {
        id,
        isActive: true,
        ...(!this.requestContext.isAdmin && {
          createdBy: { id: this.requestContext.user.id },
        }),
      },
      relations: [...this.relations, 'results'],
      order: { results: { id: 'ASC' } },
    });

    if (!gembaWalk) {
      throw new NotFoundException(`Recorrido con ID ${id} no encontrado`);
    }

    this.assertUserPlant(
      gembaWalk.gembaWalkCalendar.gembaWalkZone.manufacturingPlant.id,
    );

    return gembaWalk;
  }
}
