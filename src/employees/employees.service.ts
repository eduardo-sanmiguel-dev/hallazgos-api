import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RequestContextService } from 'shared/services/request-context.service';

import {
  Repository,
  FindOptionsWhere,
  In,
  ILike,
  ObjectLiteral,
  Raw,
} from 'typeorm';

import { scopePlantIds } from '@shared/utils';

import { Employee, EmployeeArea, EmployeePosition } from './entities';
import { Genre } from 'genres/entities/genre.entity';
import {
  CreateEmployeeDto,
  FiltersEmployeeDto,
  UpdateEmployeeDto,
} from './dto';
import { Zone } from 'zones/entities/zone.entity';

@Injectable()
export class EmployeesService {
  private readonly relations = [
    'area',
    'position',
    'gender',
    'manufacturingPlants',
  ];

  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Zone)
    private readonly zoneRepository: Repository<Zone>,
    @InjectRepository(EmployeeArea)
    private readonly employeeAreaRepository: Repository<EmployeeArea>,
    @InjectRepository(EmployeePosition)
    private readonly employeePositionRepository: Repository<EmployeePosition>,
    private readonly requestContext: RequestContextService,
    @InjectRepository(Genre)
    private readonly genreRepository: Repository<Genre>,
  ) {}

  get areas() {
    return this.employeeAreaRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  get positions() {
    return this.employeePositionRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  get genres() {
    return this.genreRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  get manufacturingPlants() {
    return [
      ...(this.requestContext.userOrNull?.manufacturingPlants ?? []),
    ].sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Registro activo de un catálogo por id. Sin id no consulta (con
   * `id: undefined` TypeORM ignora la condición y devuelve cualquier registro);
   * un id inexistente o inactivo responde 404 en lugar de guardar null.
   */
  private async findCatalog<T extends ObjectLiteral>(
    repository: Repository<T>,
    id: number | undefined,
    label: string,
  ): Promise<T | undefined> {
    if (!id) return undefined;

    const found = await repository.findOne({
      where: { id, isActive: true } as unknown as FindOptionsWhere<T>,
    });

    if (!found) {
      throw new NotFoundException(`${label} con id ${id} no encontrado`);
    }

    return found;
  }

  async create(createEmployeeDto: CreateEmployeeDto) {
    const {
      code,
      name,
      birthdate,
      dateOfAdmission,
      areaId,
      positionId,
      genderId,
      manufacturingPlantsIds,
    } = createEmployeeDto;

    const manufacturingPlants =
      this.requestContext.userOrNull?.manufacturingPlants;

    const area = await this.findCatalog(
      this.employeeAreaRepository,
      areaId,
      'Área',
    );
    const position = await this.findCatalog(
      this.employeePositionRepository,
      positionId,
      'Puesto',
    );
    const gender = await this.findCatalog(
      this.genreRepository,
      genderId,
      'Género',
    );

    const employee = this.employeeRepository.create({
      code,
      name,
      birthdate,
      dateOfAdmission,
      area,
      position,
      gender,
      manufacturingPlants: manufacturingPlants.filter((mp) =>
        manufacturingPlantsIds.includes(mp.id),
      ),
    });
    try {
      await this.employeeRepository.save(employee);
    } catch (error) {
      this.handleDuplicateCode(error, code);
    }

    return employee;
  }

  private handleDuplicateCode(error: any, code: number | string): never {
    if (error.code === '23505') {
      throw new ConflictException(
        `Ya existe un empleado con el código ${code}. Si no aparece en la lista, puede estar inactivo.`,
      );
    }

    throw error;
  }

  async findCatalogs() {
    return {
      areas: await this.areas,
      positions: await this.positions,
      genres: await this.genres,
      manufacturingPlants: this.manufacturingPlants,
    };
  }

  findPositions() {
    return this.positions;
  }

  findAll(filtersEmployeeDto: FiltersEmployeeDto) {
    const { manufacturingPlants } = this.requestContext.user;

    const rawIsActive = filtersEmployeeDto.isActive as
      boolean | string | undefined;

    const parsedIsActive =
      rawIsActive === true || rawIsActive === 'true'
        ? true
        : rawIsActive === false || rawIsActive === 'false'
          ? false
          : undefined;

    const {
      manufacturingPlantId = 0,
      name = '',
      positionId = 0,
      areaId = 0,
      genreId = 0,
    } = filtersEmployeeDto;

    // Solo plantas del usuario: con una planta ajena no hay resultados
    // (antes el filtro reemplazaba las plantas del usuario).
    const plantIds = scopePlantIds(manufacturingPlants, manufacturingPlantId);
    const { page, limit } = filtersEmployeeDto;

    if (!plantIds.length) {
      return page === undefined || limit === undefined
        ? Promise.resolve([])
        : Promise.resolve({ data: [], count: 0 });
    }

    const where: FindOptionsWhere<Employee> = {
      isActive: parsedIsActive ?? true,
      manufacturingPlants: { id: In(plantIds) },
    };

    if (positionId) {
      where.position = {
        id: positionId,
      };
    }

    if (areaId) {
      where.area = {
        id: areaId,
      };
    }

    if (genreId) {
      where.gender = { id: genreId };
    }

    // `name` searches by employee name or by employee code (partial match).
    const search = name.trim();

    const whereWithSearch: FindOptionsWhere<Employee>[] = search
      ? [
          { ...where, name: ILike(`%${search}%`) },
          {
            ...where,
            code: Raw((alias) => `CAST(${alias} AS TEXT) ILIKE :code`, {
              code: `%${search}%`,
            }),
          },
        ]
      : [where];

    if (page === undefined || limit === undefined) {
      return this.employeeRepository.find({
        where: whereWithSearch,
        relations: this.relations,
        order: {
          name: 'ASC',
        },
      });
    }

    return this.findAllPaginated(whereWithSearch, Number(page), Number(limit));
  }

  private async findAllPaginated(
    where: FindOptionsWhere<Employee>[],
    page: number,
    limit: number,
  ) {
    const isUnlimited = limit === -1;

    const [data, count] = await this.employeeRepository.findAndCount({
      where,
      relations: this.relations,
      order: {
        name: 'ASC',
        id: 'ASC',
      },
      ...(!isUnlimited && { take: limit, skip: (page - 1) * limit }),
    });

    return { data, count };
  }

  async findOne(id: number) {
    const employee = await this.employeeRepository.findOne({
      where: {
        id,
        isActive: true,
        manufacturingPlants: {
          id: In(this.requestContext.manufacturingPlantIds),
        },
      },
      relations: this.relations,
    });

    if (!employee) {
      throw new NotFoundException(`Employee with id ${id} not found`);
    }

    return employee;
  }

  async findPositionById(positionId: number) {
    const position = await this.employeePositionRepository.findOne({
      where: { id: positionId, isActive: true },
    });
    if (!position) {
      throw new NotFoundException(`Position with id ${positionId} not found`);
    }
    return position;
  }

  async update(id: number, updateEmployeeDto: UpdateEmployeeDto) {
    const employee = await this.findOne(id);

    const {
      code,
      name,
      birthdate,
      dateOfAdmission,
      areaId,
      positionId,
      genderId,
      manufacturingPlantsIds,
    } = updateEmployeeDto;

    const manufacturingPlants =
      this.requestContext.userOrNull?.manufacturingPlants;

    // Lo que no se envía conserva su valor actual (antes, sin areaId se
    // asignaba cualquier área y sin plantas respondía 500).
    const area =
      (await this.findCatalog(this.employeeAreaRepository, areaId, 'Área')) ??
      employee.area;
    const position =
      (await this.findCatalog(
        this.employeePositionRepository,
        positionId,
        'Puesto',
      )) ?? employee.position;
    const gender =
      (await this.findCatalog(this.genreRepository, genderId, 'Género')) ??
      employee.gender;

    Object.assign(employee, {
      ...(code !== undefined && { code }),
      ...(name !== undefined && { name }),
      ...(birthdate !== undefined && { birthdate }),
      ...(dateOfAdmission !== undefined && { dateOfAdmission }),
      area,
      position,
      gender,
      ...(manufacturingPlantsIds && {
        manufacturingPlants: manufacturingPlants.filter((mp) =>
          manufacturingPlantsIds.includes(mp.id),
        ),
      }),
    });

    try {
      return await this.employeeRepository.save({ ...employee });
    } catch (error) {
      this.handleDuplicateCode(error, code);
    }
  }

  async remove(id: number) {
    await this.findOne(id);

    return await this.employeeRepository.save({
      id,
      isActive: false,
    });
  }

  async seed() {
    this.zoneRepository;

    return { message: 'Seed completed successfully2' };
  }
}
