import { catalogIncludesInactive } from '../shared/utils/catalog-visibility.js';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RequestContextService } from '../shared/services/request-context.service.js';

import {
  type FindOptionsWhere,
  ILike,
  In,
  Not,
  Raw,
  Repository,
} from 'typeorm';
import * as argon2 from 'argon2';

import {
  CreateUserDto,
  QueryUserDto,
  UpdateUserDto,
  USER_DEFAULT_SORT,
  USER_ORDER_BY_PATTERN,
  USER_SORT_COLUMNS,
} from './dto/index.js';
import { buildFindOrder, type SortQuery } from '../shared/utils/sort.js';
import { GembaWalkObserver } from '../gemba-walk-observers/entities/gemba-walk-observer.entity.js';
import { isGembaWalkObserver } from '../gemba-walk-observers/gemba-walk-observer-access.js';
import { User } from './entities/user.entity.js';
import {
  evidencePermissionsFor,
  type EvidencePermissions,
} from '../evidences/evidence-permissions.js';
import { ROLE_SUPERVISOR } from '../shared/constants/index.js';
import { ManufacturingPlantsService } from '../manufacturing-plants/manufacturing-plants.service.js';
import { ZonesService } from '../zones/zones.service.js';
import { ProcessesService } from '../processes/processes.service.js';
import { ManufacturingPlant } from '../manufacturing-plants/entities/manufacturing-plant.entity.js';
import { DEFAULT_PAGE_LIMIT } from '../shared/dto/pagination.decorators.js';

/**
 * Deja en el usuario solo las plantas que cumplen `filters.plant`. Quien la
 * llama ya cargó la relación `manufacturingPlants`.
 */
const keepMatching = (
  user: User,
  filters: { plant: (plant: ManufacturingPlant) => boolean },
) => {
  user.manufacturingPlants = user.manufacturingPlants.filter(filters.plant);
  return user;
};

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

/** Plantas y zonas del usuario por nombre, como en los listados. */
const sortByName = (user: User) => {
  user.manufacturingPlants?.sort(byName);
  user.zones?.sort(byName);
};

/** Únicos destinatarios de los avisos de la planta 3 (pendiente: configuración). */
const PLANT_3_RECIPIENT_EMAILS = [
  'strujillo@hadamexico.com',
  'Dspaggiari@hadamexico.com',
  'Aholguin@hada.com.co',
  'Cvelasquez@hada.com.co',
  'sst@hadamexico.com',
  'Btorres@hadainternational.com',
];

/** Usuario en sesión que recibe el UI: datos planos (sin métodos) y permisos. */
export type CurrentUser = Omit<User, 'hashPassword'> & {
  evidencePermissions: EvidencePermissions;
  // Si puede usar Gemba Walk: antes el UI lo pedía aparte en cada carga
  // (GET /gemba-walk/walks/access, que se conserva).
  isGembaWalkObserver: boolean;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(GembaWalkObserver)
    private readonly gembaWalkObserverRepository: Repository<GembaWalkObserver>,
    private readonly requestContext: RequestContextService,
    private readonly manufacturingPlantsService: ManufacturingPlantsService,
    private readonly zonesService: ZonesService,
    private readonly processesService: ProcessesService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const {
      name,
      email,
      password,
      rule,
      manufacturingPlantNames,
      zoneNames = [],
      processNames = [],
    } = createUserDto;

    const manufacturingPlants = await this.resolvePlants(
      manufacturingPlantNames,
    );

    const zones =
      await this.zonesService.findAllByManufacturingPlantNames(zoneNames);

    const processes =
      await this.processesService.findAllByManufacturingPlantNames(
        processNames,
      );

    const user = await this.userRepository.save(
      this.userRepository.create({
        name,
        email,
        ...(password && { password }),
        role: rule,
        manufacturingPlants,
        ...(zones.length && { zones }),
        ...(processes.length && { processes }),
      }),
    );

    return this.findOne(user.id);
  }

  /** No se aplica al lookup interno de autenticación, que aún no tiene req.user. */
  async findOneForRequest(id: number): Promise<User> {
    const user = await this.findOne(id);
    const allowed = this.requestContext.manufacturingPlantIds;
    if (
      !user.manufacturingPlants.some((plant) =>
        allowed.includes(Number(plant.id)),
      )
    ) {
      throw new NotFoundException(`Usuario #${id} no encontrado`);
    }
    return user;
  }

  assertPlantsForRequest(names: string[] = []) {
    const allowed = new Set(
      this.requestContext.user.manufacturingPlants.map((plant) => plant.name),
    );
    if (names.some((name) => !allowed.has(name)))
      throw new NotFoundException('Planta no encontrada');
  }

  findAllForRequest(query: QueryUserDto) {
    const allowed = this.requestContext.manufacturingPlantIds;
    return this.findAll(query, allowed);
  }

  async findAll(queryUserDto: QueryUserDto, allowedPlantIds?: number[]) {
    const includeInactive = catalogIncludesInactive(
      queryUserDto.includeInactive,
    );
    const {
      name,
      manufacturingPlantId,
      rule,
      zoneId,
      zoneIds,
      processId,
      orderBy,
      view,
    } = queryUserDto;
    const { page, limit } = queryUserDto;
    const search = queryUserDto.search?.trim();

    let order;
    let sort: SortQuery | undefined;

    // El DTO ya valida el formato; se revisa también aquí para no armar el
    // orden con un valor fuera de la lista permitida. La dirección va en
    // `campo|dir` (selectores) o en `order` (tablas).
    if (orderBy && USER_ORDER_BY_PATTERN.test(orderBy)) {
      const [key, direction] = orderBy.split('|');
      const dir = (direction ?? queryUserDto.order ?? 'asc').toLowerCase();
      sort = { orderBy: key, order: dir };
      order = { [key]: dir.toUpperCase() };
    }

    const plantIds =
      allowedPlantIds === undefined
        ? manufacturingPlantId
          ? [Number(manufacturingPlantId)]
          : undefined
        : allowedPlantIds.filter(
            (id) =>
              !manufacturingPlantId || id === Number(manufacturingPlantId),
          );
    const base: FindOptionsWhere<User> = {
      ...(!includeInactive && { isActive: true }),
      ...(name && { name: ILike(`%${name}%`) }),
      ...(plantIds !== undefined && {
        manufacturingPlants: { id: In(plantIds) },
      }),
      ...(rule && { role: rule }),
      ...(zoneIds?.length && { zones: { id: In(zoneIds.map(Number)) } }),
      ...(zoneId && { zones: { id: In([zoneId]) }, role: ROLE_SUPERVISOR }),
      ...(processId && { processes: { id: In([processId]) } }),
    };

    const where: FindOptionsWhere<User>[] = search
      ? [
          { ...base, name: ILike(`%${search}%`) },
          { ...base, email: ILike(`%${search}%`) },
        ]
      : [base];

    // Selectores (view=options): la lista ligera completa. La tabla, siempre
    // paginada: sin page/limit, la primera página (antes respondía todos los
    // usuarios con zonas y procesos, ~4.6 MB).
    if (view === 'options' && page === undefined) {
      return this.userRepository.find({
        where,
        select: { id: true, name: true, email: true, role: true },
        order: order ?? { name: 'ASC' },
      });
    }

    const result = await this.findAllPaginated(
      where,
      Number(page ?? 1),
      Number(limit ?? DEFAULT_PAGE_LIMIT),
      sort,
    );
    // Cada usuario muestra solo las plantas del filtro o, sin él, las que
    // comparte con quien consulta (nunca nombres de plantas ajenas).
    if (plantIds !== undefined)
      for (const user of result.data)
        keepMatching(user, {
          plant: (plant) => plantIds.includes(Number(plant.id)),
        });
    return result;
  }

  /**
   * Zonas y procesos de los usuarios, una relación por consulta y una tras
   * otra. Con relationLoadStrategy 'query', TypeORM 0.3 lanzaba esas
   * consultas en paralelo sobre la misma conexión: pg lo marca obsoleto
   * ("client is already executing a query") y dejará de funcionar en pg 9.
   * `relations` acepta anidadas, p. ej. 'zones.manufacturingPlant'.
   */
  private async loadAssignments(users: User[], relations: string[]) {
    if (!users.length) return users;

    const byId = new Map(users.map((user) => [user.id, user]));
    const ids = [...byId.keys()];

    for (const relation of ['zones', 'processes'] as const) {
      const nested = relations.filter(
        (name) => name === relation || name.startsWith(`${relation}.`),
      );
      // Todos los llamadores piden zonas y procesos (con sus plantas).

      const rows = await this.userRepository.find({
        where: { id: In(ids) },
        relations: nested,
      });
      for (const row of rows) {
        const user = byId.get(row.id);
        if (user) user[relation] = row[relation] as never;
      }
    }

    return users;
  }

  private readonly listRelations = [
    'manufacturingPlants',
    'zones',
    'zones.manufacturingPlant',
    'processes',
    'processes.manufacturingPlant',
  ];

  // La tabla de /users solo muestra plantas: zonas y procesos se cargan al
  // editar (findOne).
  private async findAllPaginated(
    where: FindOptionsWhere<User>[],
    page: number,
    limit: number,
    sort: SortQuery = {},
  ) {
    // Con skip/take solo se ordena por la entidad principal; las plantas se
    // ordenan después en memoria.
    const [data, count] = await this.userRepository.findAndCount({
      where,
      relations: ['manufacturingPlants'],
      order: buildFindOrder(USER_SORT_COLUMNS, sort, USER_DEFAULT_SORT),
      take: limit,
      skip: (page - 1) * limit,
    });

    data.forEach(sortByName);

    return { data, count };
  }

  findAllByPlant(plantId: number): Promise<User[]> {
    if (plantId === 3) {
      return this.userRepository.find({
        where: {
          isActive: true,
          manufacturingPlants: {
            id: plantId,
          },
          // Sin distinguir mayúsculas: la lista trae "Dspaggiari@…" y en la
          // base están en minúsculas, así que antes se quedaban sin aviso.
          email: Raw((alias) => `LOWER(${alias}) IN (:...plant3Emails)`, {
            plant3Emails: PLANT_3_RECIPIENT_EMAILS.map((email) =>
              email.toLowerCase(),
            ),
          }),
        },
      });
    }

    return this.userRepository.find({
      where: {
        isActive: true,
        manufacturingPlants: {
          id: plantId,
        },
        email: Not(
          In([
            'eduardo-266@hotmail.com',
            'eduardo-supervisor@hotmail.com',
            'eduardo-general@hotmail.com',
          ]),
        ),
      },
    });
  }

  /**
   * Usuario en sesión de cada petición (JwtMiddleware): datos propios y sus
   * plantas activas, que son sus permisos. Una sola consulta: antes usaba
   * findOne, que hacía 4 (ids DISTINCT por el take de findOne, usuario con
   * plantas, zonas y procesos) en cada petición, y nadie lee las zonas ni los
   * procesos del usuario en sesión (un supervisor llega a tener 261 zonas).
   * Mismo criterio que findOne: inactivo o sin plantas activas → 404.
   */
  async findSessionUser(id: number): Promise<User> {
    const [user] = await this.userRepository.find({
      where: {
        id,
        isActive: true,
        manufacturingPlants: { isActive: true },
      },
      relations: ['manufacturingPlants'],
    });

    if (!user) throw new NotFoundException(`Usuario #${id} no encontrado`);

    return keepMatching(user, { plant: (plant) => plant.isActive });
  }

  // Usuario con zonas y procesos (editar y vistas de detalle). Solo plantas
  // activas.
  async findOne(id: number): Promise<User> {
    const user = await this.userRepository.findOne({
      where: {
        id,
        isActive: true,
        manufacturingPlants: { isActive: true },
      },
      relations: ['manufacturingPlants'],
    });

    if (!user) throw new NotFoundException(`Usuario #${id} no encontrado`);

    await this.loadAssignments([user], this.listRelations);
    return keepMatching(user, { plant: (plant) => plant.isActive });
  }

  async findSupervisor({
    manufacturingPlantId,
    zoneId,
    supervisorId,
  }: {
    manufacturingPlantId: number;
    zoneId: number;
    supervisorId: number;
  }): Promise<User[]> {
    const whereDefault = {
      isActive: true,
      role: ROLE_SUPERVISOR,
      manufacturingPlants: {
        id: manufacturingPlantId,
      },
      zones: {
        id: zoneId,
      },
      email: Not(
        In([
          'eduardo-266@hotmail.com',
          'eduardo-supervisor@hotmail.com',
          'eduardo-general@hotmail.com',
        ]),
      ),
    };

    if (supervisorId) {
      return this.userRepository.find({
        where: {
          ...whereDefault,
          id: supervisorId,
        },
      });
    }

    return this.userRepository.find({
      where: whereDefault,
    });
  }

  async findProcesses({
    manufacturingPlantId,
    processId,
    supervisorId,
  }: {
    manufacturingPlantId: number;
    processId: number;
    supervisorId: number;
  }): Promise<User[]> {
    const whereDefault = {
      isActive: true,
      role: ROLE_SUPERVISOR,
      manufacturingPlants: {
        id: manufacturingPlantId,
      },
      processes: {
        id: processId,
      },
      email: Not(
        In([
          'eduardo-266@hotmail.com',
          'eduardo-supervisor@hotmail.com',
          'eduardo-general@hotmail.com',
        ]),
      ),
    };

    if (supervisorId) {
      return this.userRepository.find({
        where: {
          ...whereDefault,
          id: supervisorId,
        },
      });
    }

    return this.userRepository.find({
      where: whereDefault,
    });
  }

  async getSupervisors(): Promise<User[]> {
    const { manufacturingPlants } = this.requestContext.user;

    const manufacturingPlantsIds = manufacturingPlants.map(
      (manufacturingPlant) => manufacturingPlant.id,
    );

    const supervisors = await this.loadAssignments(
      await this.userRepository.find({
        where: {
          isActive: true,
          role: ROLE_SUPERVISOR,
          manufacturingPlants: {
            id: In(manufacturingPlantsIds),
          },
          email: Not(In(['eduardo-supervisor@hotmail.com'])),
        },
        relations: ['manufacturingPlants'],
        order: {
          name: 'ASC',
        },
      }),
      ['zones', 'processes'],
    );

    return supervisors.map((supervisor) =>
      keepMatching(supervisor, {
        plant: (plant) => manufacturingPlantsIds.includes(Number(plant.id)),
      }),
    );
  }

  /**
   * Supervisores de una zona de la planta, sin relaciones: el formulario de
   * nuevo hallazgo los pide al elegir el lugar. Antes descargaba todos con
   * sus zonas y procesos (~1.5 MB) para filtrarlos en el navegador.
   * 404 si la planta no es del usuario en sesión.
   */
  getZoneSupervisors(manufacturingPlantId: number, zoneId: number) {
    const plantId =
      this.requestContext.assertManufacturingPlant(manufacturingPlantId);

    return this.userRepository.find({
      where: {
        isActive: true,
        role: ROLE_SUPERVISOR,
        manufacturingPlants: { id: plantId },
        zones: { id: Number(zoneId) },
        email: Not(In(['eduardo-supervisor@hotmail.com'])),
      },
      select: { id: true, name: true, email: true },
      order: { name: 'ASC' },
    });
  }

  /**
   * Usuario en sesión para el UI, con sus permisos especiales sobre hallazgos
   * ya calculados (antes el UI pedía las listas completas de correos a
   * GET /evidences/permissions/config, ya eliminado).
   */
  async getInformationCurrentUser(): Promise<CurrentUser> {
    const userId = this.requestContext.userId;

    const user = await this.userRepository.findOne({
      where: {
        id: userId,
        isActive: true,
        manufacturingPlants: {
          isActive: true,
        },
      },
      relations: ['manufacturingPlants', 'manufacturingPlants.country'],
    });

    if (!user) throw new NotFoundException(`Usuario #${userId} no encontrado`);

    await this.loadAssignments([user], ['zones', 'processes']);
    keepMatching(user, { plant: (plant) => plant.isActive });
    const isObserver = await isGembaWalkObserver(
      this.gembaWalkObserverRepository,
      { userId, isAdmin: this.requestContext.isAdmin },
    );
    // `password` no se selecciona (select: false): la copia no lo incluye.
    return {
      ...user,
      evidencePermissions: evidencePermissionsFor(user),
      isGembaWalkObserver: isObserver,
    };
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    const {
      name,
      email,
      password,
      rule,
      manufacturingPlantNames,
      zoneNames,
      processNames,
    } = updateUserDto;

    const manufacturingPlants = await this.resolvePlants(
      manufacturingPlantNames,
    );

    let zones = [];
    let processes = [];

    if (rule === ROLE_SUPERVISOR) {
      zones =
        await this.zonesService.findAllByManufacturingPlantNames(zoneNames);

      processes =
        await this.processesService.findAllByManufacturingPlantNames(
          processNames,
        );
    }

    user.name = name;
    user.email = email;
    if (password) {
      user.password = await argon2.hash(password);
      // Contraseña nueva: se cierran las sesiones abiertas de ese usuario.
      user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    }
    user.role = rule;
    user.zones = zones;
    user.processes = processes;
    user.manufacturingPlants = manufacturingPlants;

    return this.userRepository.save({ ...user });
  }

  /**
   * Plantas por nombre: todas deben existir (y estar activas) y debe haber al
   * menos una. Ningún rol puede operar sin plantas: el login y la sesión las
   * exigen.
   */
  private async resolvePlants(names: string[]): Promise<ManufacturingPlant[]> {
    const uniqueNames = [...new Set(names ?? [])];

    if (!uniqueNames.length) {
      throw new BadRequestException('Debe asignar al menos una planta');
    }

    const plants =
      await this.manufacturingPlantsService.findAllByNames(uniqueNames);
    const found = new Set(plants.map(({ name }) => name));
    const missing = uniqueNames.filter((name) => !found.has(name));

    if (missing.length) {
      throw new BadRequestException(
        `Plantas no encontradas o inactivas: ${missing.join(', ')}`,
      );
    }

    return plants;
  }

  async remove(id: number): Promise<User> {
    await this.findOne(id);

    return await this.userRepository.save({
      id,
      isActive: false,
    });
  }
}
