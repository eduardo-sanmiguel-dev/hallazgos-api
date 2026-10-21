import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RequestContextService } from '../shared/services/request-context.service.js';

import { type FindOptionsWhere, ILike, In, Not, Repository } from 'typeorm';
import * as argon2 from 'argon2';

import {
  CreateUserDto,
  QueryUserDto,
  UpdateUserDto,
  USER_ORDER_BY_PATTERN,
} from './dto/index.js';
import { User } from './entities/user.entity.js';
import { ROLE_SUPERVISOR } from '../shared/constants/index.js';
import { ManufacturingPlantsService } from '../manufacturing-plants/manufacturing-plants.service.js';
import { ZonesService } from '../zones/zones.service.js';
import { ProcessesService } from '../processes/processes.service.js';
import { ManufacturingPlant } from '../manufacturing-plants/entities/manufacturing-plant.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
      throw new NotFoundException(`Usuario con id ${id} no encontrado`);
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

  findAll(queryUserDto: QueryUserDto, allowedPlantIds?: number[]) {
    const { name, manufacturingPlantId, rule, zoneId, processId, orderBy } =
      queryUserDto;
    const { page, limit } = queryUserDto;
    const search = queryUserDto.search?.trim();

    let order;

    // El DTO ya valida el formato; se revisa también aquí para no armar el
    // orden con un valor que no sea `campo|asc|desc` de la lista permitida.
    if (orderBy && USER_ORDER_BY_PATTERN.test(orderBy)) {
      const [key, direction] = orderBy.split('|');
      order = { [key]: direction.toUpperCase() };
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
      isActive: true,
      ...(name && { name: ILike(`%${name}%`) }),
      ...(plantIds !== undefined && {
        manufacturingPlants: { id: In(plantIds) },
      }),
      ...(rule && { role: rule }),
      ...(zoneId && { zones: { id: In([zoneId]) }, role: ROLE_SUPERVISOR }),
      ...(processId && { processes: { id: In([processId]) } }),
    };

    const where: FindOptionsWhere<User>[] = search
      ? [
          { ...base, name: ILike(`%${search}%`) },
          { ...base, email: ILike(`%${search}%`) },
        ]
      : [base];

    if (page !== undefined && limit !== undefined) {
      return this.findAllPaginated(where, Number(page), Number(limit));
    }

    return this.userRepository.find({
      where,
      relations: this.listRelations,
      order: {
        ...(order
          ? {
              [Object.keys(order)[0]]: Object.values(order)[0],
            }
          : { id: 'DESC' }),
        manufacturingPlants: {
          name: 'ASC',
        },
        zones: {
          name: 'ASC',
        },
      },
    });
  }

  private readonly listRelations = [
    'manufacturingPlants',
    'zones',
    'zones.manufacturingPlant',
    'processes',
    'processes.manufacturingPlant',
  ];

  private async findAllPaginated(
    where: FindOptionsWhere<User>[],
    page: number,
    limit: number,
  ) {
    // Con skip/take solo se ordena por la entidad principal; plantas y zonas
    // se ordenan después en memoria (mismo resultado que el listado completo).
    const [data, count] = await this.userRepository.findAndCount({
      where,
      relations: this.listRelations,
      order: { id: 'DESC' },
      ...(limit !== -1 && { take: limit, skip: (page - 1) * limit }),
    });

    const byName = (a: { name: string }, b: { name: string }) =>
      a.name.localeCompare(b.name);

    for (const user of data) {
      user.manufacturingPlants?.sort(byName);
      user.zones?.sort(byName);
    }

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
          email: In([
            'strujillo@hadamexico.com',
            'Dspaggiari@hadamexico.com',
            'Aholguin@hada.com.co',
            'Cvelasquez@hada.com.co',
            'sst@hadamexico.com',
            'Btorres@hadainternational.com',
          ]),
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

  async findOne(id: number): Promise<User> {
    const user = await this.userRepository.findOne({
      where: {
        id,
        isActive: true,
        manufacturingPlants: { isActive: true },
      },
      relations: [
        'manufacturingPlants',
        'zones',
        'zones.manufacturingPlant',
        'processes',
        'processes.manufacturingPlant',
      ],
    });

    if (!user)
      throw new NotFoundException(`Usuario con id ${id} no encontrado`);

    return user;
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

    return this.userRepository.find({
      where: {
        isActive: true,
        role: ROLE_SUPERVISOR,
        manufacturingPlants: {
          id: In(manufacturingPlantsIds),
        },
        email: Not(In(['eduardo-supervisor@hotmail.com'])),
      },
      relations: ['manufacturingPlants', 'zones', 'processes'],
      order: {
        name: 'ASC',
      },
    });
  }

  async getInformationCurrentUser(): Promise<User> {
    const userId = this.requestContext.userId;

    const user = await this.userRepository.findOne({
      where: {
        id: userId,
        isActive: true,
        manufacturingPlants: {
          isActive: true,
        },
      },
      relations: [
        'manufacturingPlants',
        'zones',
        'processes',
        'manufacturingPlants.country',
      ],
    });

    if (!user)
      throw new NotFoundException(`Usuario con id ${userId} no encontrado`);

    return user;
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
