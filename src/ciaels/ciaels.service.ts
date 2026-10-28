import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RequestContextService } from '../shared/services/request-context.service.js';

import { type FindOptionsWhere, ILike, Raw, Repository } from 'typeorm';

import { ManufacturingPlant } from '../manufacturing-plants/entities/manufacturing-plant.entity.js';
import { AccidentPosition } from '../accident-positions/entities/accident-position.entity.js';
import { AssociatedTask } from '../associated-tasks/entities/associated-task.entity.js';
import { NatureOfEvent } from '../nature-of-events/entities/nature-of-event.entity.js';
import { TypeOfInjury } from '../type-of-injuries/entities/type-of-injury.entity.js';
import { TypesOfEvent } from '../types-of-events/entities/types-of-event.entity.js';
import { CieDiagnosis } from '../cie-diagnoses/entities/cie-diagnosis.entity.js';
import { AtMechanism } from '../at-mechanisms/entities/at-mechanism.entity.js';
import { TypeOfLink } from '../type-of-links/entities/type-of-link.entity.js';
import { WorkingDay } from '../working-days/entities/working-day.entity.js';
import { RiskFactor } from '../risk-factors/entities/risk-factor.entity.js';
import { BodyPart } from '../body-parts/entities/body-part.entity.js';
import { AtAgent } from '../at-agents/entities/at-agent.entity.js';
import { Country } from '../countries/entities/country.entity.js';
import { Machine } from '../machines/entities/machine.entity.js';
import {
  CreateCiaelDto,
  FiltersCiaelDto,
  UpdateCiaelDto,
} from './dto/index.js';
import { Genre } from '../genres/entities/genre.entity.js';
import { Zone } from '../zones/entities/zone.entity.js';
import { Area } from '../areas/entities/area.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Ciael } from './entities/ciael.entity.js';
import { Employee, EmployeeArea } from '../employees/entities/index.js';

@Injectable()
export class CiaelsService {
  private readonly logger = new Logger(CiaelsService.name);
  private readonly relations = [
    'manufacturingPlant',
    'typeOfEvent',
    'createdBy',
    'employee',
    'employee.gender',
    'cieDiagnosis',
    'accidentPosition',
    'zone',
    'zone.area',
    'bodyPart',
    'atAgent',
    'typeOfInjury',
    'atMechanism',
    'workingDay',
    'typeOfLink',
    'machine',
    'associatedTask',
    'areaLeader',
    'riskFactor',
    'natureOfEvent',
    'manager',
  ];

  private readonly select = {
    id: true,
    description: true,
    eventDate: true,
    createdAt: true,
    daysOfDisability: true,
    manufacturingPlant: { name: true },
    typeOfEvent: { name: true },
    createdBy: { name: true },
    timeWorked: true,
    usualWork: true,
    isDeath: true,
    isInside: true,
    monthsOfSeniority: true,
    employee: {
      code: true,
      name: true,
      dateOfAdmission: true,
      gender: { name: true },
      birthdate: true,
    },
    cieDiagnosis: { name: true },
    accidentPosition: { name: true },
    zone: { name: true, area: { name: true } },
    bodyPart: { name: true },
    atAgent: { name: true },
    typeOfInjury: { name: true },
    atMechanism: { name: true },
    workingDay: { name: true },
    typeOfLink: { name: true },
    machine: { name: true },
    associatedTask: { name: true },
    areaLeader: { name: true },
    riskFactor: { name: true },
    natureOfEvent: { name: true },
    manager: { name: true },
  };

  constructor(
    private readonly requestContext: RequestContextService,
    @InjectRepository(Ciael)
    private readonly ciaelRepository: Repository<Ciael>,
    @InjectRepository(Area)
    private readonly areaRepository: Repository<Area>,
    @InjectRepository(AtAgent)
    private readonly atAgentRepository: Repository<AtAgent>,
    @InjectRepository(ManufacturingPlant)
    private readonly manufacturingPlantRepository: Repository<ManufacturingPlant>,
    @InjectRepository(TypesOfEvent)
    private readonly typesOfEventRepository: Repository<TypesOfEvent>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(CieDiagnosis)
    private readonly cieDiagnosisRepository: Repository<CieDiagnosis>,
    @InjectRepository(Zone)
    private readonly zoneRepository: Repository<Zone>,
    @InjectRepository(BodyPart)
    private readonly bodyPartRepository: Repository<BodyPart>,
    @InjectRepository(TypeOfInjury)
    private readonly typeOfInjuryRepository: Repository<TypeOfInjury>,
    @InjectRepository(AtMechanism)
    private readonly atMechanismRepository: Repository<AtMechanism>,
    @InjectRepository(WorkingDay)
    private readonly workingDayRepository: Repository<WorkingDay>,
    @InjectRepository(TypeOfLink)
    private readonly typeOfLinkRepository: Repository<TypeOfLink>,
    @InjectRepository(AccidentPosition)
    private readonly accidentPositionRepository: Repository<AccidentPosition>,
    @InjectRepository(Machine)
    private readonly machineRepository: Repository<Machine>,
    @InjectRepository(AssociatedTask)
    private readonly associatedTaskRepository: Repository<AssociatedTask>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RiskFactor)
    private readonly riskFactorRepository: Repository<RiskFactor>,
    @InjectRepository(NatureOfEvent)
    private readonly natureOfEventRepository: Repository<NatureOfEvent>,
    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,
    @InjectRepository(Genre)
    private readonly genreRepository: Repository<Genre>,
    @InjectRepository(EmployeeArea)
    private readonly employeeAreaRepository: Repository<EmployeeArea>,
  ) {
    this.logger.log('CiaelsService initialized');
    this.areaRepository;
    this.atAgentRepository;
    this.countryRepository;
    this.genreRepository;
  }

  async getPlantMx() {
    this.employeeAreaRepository;
    const manufacturingPlantMX = await this.manufacturingPlantRepository.find({
      where: { name: 'Tepotzotlán' },
    });
    return manufacturingPlantMX;
  }

  async create(createCiaelDto: CreateCiaelDto) {
    const createdBy = this.requestContext.user;

    const {
      manufacturingPlantId,
      description,
      typeOfEventId,
      employeeId,
      eventDate,
      cieDiagnosisId,
      daysOfDisability,
      zoneId,
      bodyPartId,
      atAgentId,
      typeOfInjuryId,
      atMechanismId,
      workingDayId,
      timeWorked,
      usualWork,
      typeOfLinkId,
      isDeath,
      accidentPositionId,
      machineId,
      machineName,
      isInside,
      associatedTaskId,
      areaLeaderId,
      riskFactorId,
      natureOfEventsId,
      managerId,
    } = createCiaelDto;

    // Falta de datos: 400 (antes respondía 404).
    if (!machineId && !machineName) {
      throw new BadRequestException('Selecciona la máquina o equipo.');
    }

    const manufacturingPlant = await this.manufacturingPlantRepository.findOne({
      where: { id: manufacturingPlantId, isActive: true },
    });

    if (!manufacturingPlant) {
      throw new NotFoundException(
        `Planta #${manufacturingPlantId} no encontrada`,
      );
    }

    const typeOfEvent = await this.typesOfEventRepository.findOne({
      where: { id: typeOfEventId, isActive: true },
    });

    if (!typeOfEvent) {
      throw new NotFoundException(
        `Tipo de evento #${typeOfEventId} no encontrado`,
      );
    }

    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, isActive: true },
    });

    if (!employee) {
      throw new NotFoundException(`Colaborador #${employeeId} no encontrado`);
    }

    const cieDiagnosis = await this.cieDiagnosisRepository.findOne({
      where: { id: cieDiagnosisId, isActive: true },
    });

    if (!cieDiagnosis) {
      throw new NotFoundException(
        `Diagnóstico CIE #${cieDiagnosisId} no encontrado`,
      );
    }

    const zone = await this.zoneRepository.findOne({
      where: { id: zoneId, isActive: true },
    });

    if (!zone) {
      throw new NotFoundException(`Zona #${zoneId} no encontrada`);
    }

    const bodyPart = await this.bodyPartRepository.findOne({
      where: { id: bodyPartId, isActive: true },
    });

    if (!bodyPart) {
      throw new NotFoundException(
        `Parte del cuerpo #${bodyPartId} no encontrada`,
      );
    }

    // Antes se buscaba en el catálogo de partes del cuerpo.
    const atAgent = await this.atAgentRepository.findOne({
      where: { id: atAgentId, isActive: true },
    });

    if (!atAgent) {
      throw new NotFoundException(`Agente AT #${atAgentId} no encontrado`);
    }

    const typeOfInjury = await this.typeOfInjuryRepository.findOne({
      where: { id: typeOfInjuryId, isActive: true },
    });

    if (!typeOfInjury) {
      throw new NotFoundException(
        `Tipo de lesión #${typeOfInjuryId} no encontrado`,
      );
    }

    const atMechanism = await this.atMechanismRepository.findOne({
      where: { id: atMechanismId, isActive: true },
    });

    if (!atMechanism) {
      throw new NotFoundException(
        `Mecanismo del AT #${atMechanismId} no encontrado`,
      );
    }

    const workingDay = await this.workingDayRepository.findOne({
      where: { id: workingDayId, isActive: true },
    });

    if (!workingDay) {
      throw new NotFoundException(`Jornada #${workingDayId} no encontrada`);
    }

    const typeOfLink = await this.typeOfLinkRepository.findOne({
      where: { id: typeOfLinkId, isActive: true },
    });

    if (!typeOfLink) {
      throw new NotFoundException(
        `Tipo de vinculación #${typeOfLinkId} no encontrado`,
      );
    }

    const accidentPosition = await this.accidentPositionRepository.findOne({
      where: { id: accidentPositionId, isActive: true },
    });

    if (!accidentPosition) {
      throw new NotFoundException(`Cargo #${accidentPositionId} no encontrado`);
    }

    let machine: Machine;
    if (machineId) {
      machine = await this.machineRepository.findOne({
        where: { id: machineId, isActive: true },
      });
      if (!machine) {
        throw new NotFoundException(
          `Máquina o equipo #${machineId} no encontrado`,
        );
      }
    } else if (machineName) {
      machine = await this.machineRepository.save({ name: machineName });
    }

    const associatedTask = await this.associatedTaskRepository.findOne({
      where: { id: associatedTaskId, isActive: true },
    });

    if (!associatedTask) {
      throw new NotFoundException(
        `Tarea asociada #${associatedTaskId} no encontrada`,
      );
    }

    const areaLeader = await this.userRepository.findOne({
      where: { id: areaLeaderId, isActive: true },
    });

    if (!areaLeader) {
      throw new NotFoundException(
        `Líder de área #${areaLeaderId} no encontrado`,
      );
    }

    const riskFactor = await this.riskFactorRepository.findOne({
      where: { id: riskFactorId, isActive: true },
    });

    if (!riskFactor) {
      throw new NotFoundException(
        `Factor de riesgo #${riskFactorId} no encontrado`,
      );
    }

    const natureOfEvent = await this.natureOfEventRepository.findOne({
      where: { id: natureOfEventsId, isActive: true },
    });

    if (!natureOfEvent) {
      throw new NotFoundException(
        `Naturaleza del evento #${natureOfEventsId} no encontrada`,
      );
    }

    let manager: User;
    if (managerId) {
      manager = await this.userRepository.findOne({
        where: { id: managerId, isActive: true },
      });

      if (!manager) {
        throw new NotFoundException(
          `Gestor en turno #${managerId} no encontrado`,
        );
      }
    }

    function getElapsedMonths(startDateStr) {
      const startDate = new Date(startDateStr);
      const currentDate = new Date();

      const yearsDifference =
        currentDate.getFullYear() - startDate.getFullYear();
      const monthsDifference = currentDate.getMonth() - startDate.getMonth();

      return yearsDifference * 12 + monthsDifference;
    }

    const monthsOfSeniority = employee.dateOfAdmission
      ? getElapsedMonths(employee.dateOfAdmission)
      : null;

    const newCiael = await this.ciaelRepository.save({
      manufacturingPlant,
      description,
      typeOfEvent,
      createdBy,
      employee,
      eventDate,
      cieDiagnosis,
      ...(daysOfDisability && { daysOfDisability }),
      zone,
      bodyPart,
      atAgent,
      typeOfInjury,
      atMechanism,
      workingDay,
      timeWorked,
      usualWork,
      typeOfLink,
      isDeath,
      accidentPosition,
      machine,
      isInside,
      monthsOfSeniority,
      associatedTask,
      areaLeader,
      riskFactor,
      natureOfEvent,
      ...(managerId && { manager }),
    });

    const ciael = await this.ciaelRepository.findOne({
      where: { id: newCiael.id },
      select: this.select,
      relations: this.relations,
    });

    //ciael.employee['age'] = calculateAge(ciael.employee.birthdate);

    return ciael;
  }

  private buildWhere(
    filtersCiaelDto: FiltersCiaelDto,
  ): FindOptionsWhere<Ciael>[] {
    const { manufacturingPlantId, typeOfEventId, zoneId, startDate, endDate } =
      filtersCiaelDto;
    const employee = (filtersCiaelDto.employee ?? '').trim();

    const base: FindOptionsWhere<Ciael> = {
      ...(manufacturingPlantId && {
        manufacturingPlant: { id: Number(manufacturingPlantId) },
      }),
      ...(typeOfEventId && { typeOfEvent: { id: Number(typeOfEventId) } }),
      ...(zoneId && { zone: { id: Number(zoneId) } }),
      // Raw evita el transformer de eventDate; compara contra la columna date.
      ...((startDate || endDate) && {
        eventDate: Raw(
          (alias) =>
            [
              startDate && `${alias} >= :startDate`,
              endDate && `${alias} <= :endDate`,
            ]
              .filter(Boolean)
              .join(' AND '),
          { ...(startDate && { startDate }), ...(endDate && { endDate }) },
        ),
      }),
    };

    return employee
      ? [
          { ...base, employee: { name: ILike(`%${employee}%`) } },
          {
            ...base,
            employee: {
              code: Raw((alias) => `CAST(${alias} AS TEXT) ILIKE :code`, {
                code: `%${employee}%`,
              }),
            },
          },
        ]
      : [base];
  }

  findAll(filtersCiaelDto: FiltersCiaelDto = {}) {
    return this.ciaelRepository.find({
      where: this.buildWhere(filtersCiaelDto),
      select: this.select,
      relations: this.relations,
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  async findAllPaginated(filtersCiaelDto: FiltersCiaelDto) {
    const { page = 1, limit = -1 } = filtersCiaelDto;
    const limitNumber = Number(limit);

    const [data, count] = await this.ciaelRepository.findAndCount({
      where: this.buildWhere(filtersCiaelDto),
      select: this.select,
      relations: this.relations,
      order: { createdAt: 'DESC', id: 'DESC' },
      ...(limitNumber !== -1 && {
        take: limitNumber,
        skip: (Number(page) - 1) * limitNumber,
      }),
    });

    return { data, count };
  }

  async findOne(id: number) {
    const ciael = await this.ciaelRepository.findOne({
      where: { id },
      select: this.select,
      relations: this.relations,
    });

    // Antes respondía 200 sin cuerpo.
    if (!ciael) {
      throw new NotFoundException(`Registro CIAEL #${id} no encontrado`);
    }

    return ciael;
  }

  update(id: number, updateCiaelDto: UpdateCiaelDto) {
    return { id, updateCiaelDto };
  }

  remove(id: number) {
    return `Esta acción elimina el registro CIAEL #${id}`;
  }

  async seed() {
    return {
      message: 'Se llamó al método seed',
    };
  }
}
