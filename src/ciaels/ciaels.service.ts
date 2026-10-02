import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST } from '@nestjs/core';

import type { Request } from 'express';
import { Repository } from 'typeorm';

import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { AccidentPosition } from 'accident-positions/entities/accident-position.entity';
import { AssociatedTask } from 'associated-tasks/entities/associated-task.entity';
import { NatureOfEvent } from 'nature-of-events/entities/nature-of-event.entity';
import { TypeOfInjury } from 'type-of-injuries/entities/type-of-injury.entity';
import { TypesOfEvent } from 'types-of-events/entities/types-of-event.entity';
import { CieDiagnosis } from 'cie-diagnoses/entities/cie-diagnosis.entity';
import { AtMechanism } from 'at-mechanisms/entities/at-mechanism.entity';
import { TypeOfLink } from 'type-of-links/entities/type-of-link.entity';
import { WorkingDay } from 'working-days/entities/working-day.entity';
import { RiskFactor } from 'risk-factors/entities/risk-factor.entity';
import { BodyPart } from 'body-parts/entities/body-part.entity';
import { AtAgent } from 'at-agents/entities/at-agent.entity';
import { Country } from 'countries/entities/country.entity';
import { Machine } from 'machines/entities/machine.entity';
import { CreateCiaelDto, UpdateCiaelDto } from './dto';
import { Genre } from 'genres/entities/genre.entity';
import { Zone } from 'zones/entities/zone.entity';
import { Area } from 'areas/entities/area.entity';
import { User } from 'users/entities/user.entity';
import { Ciael } from './entities/ciael.entity';
import { Employee, EmployeeArea } from 'employees/entities';

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
    @Inject(REQUEST) private readonly request: Request,
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
    const createdBy = this.request['user'] as User;

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

    if (!machineId && !machineName) {
      throw new NotFoundException(`Machine id or name is required`);
    }

    const manufacturingPlant = await this.manufacturingPlantRepository.findOne({
      where: { id: manufacturingPlantId, isActive: true },
    });

    if (!manufacturingPlant) {
      throw new NotFoundException(
        `ManufacturingPlant with id ${manufacturingPlantId} not found`,
      );
    }

    const typeOfEvent = await this.typesOfEventRepository.findOne({
      where: { id: typeOfEventId, isActive: true },
    });

    if (!typeOfEvent) {
      throw new NotFoundException(
        `TypesOfEvent with id ${typeOfEventId} not found`,
      );
    }

    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, isActive: true },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with id ${employeeId} not found`);
    }

    const cieDiagnosis = await this.cieDiagnosisRepository.findOne({
      where: { id: cieDiagnosisId, isActive: true },
    });

    if (!cieDiagnosis) {
      throw new NotFoundException(
        `CieDiagnosis with id ${cieDiagnosisId} not found`,
      );
    }

    const zone = await this.zoneRepository.findOne({
      where: { id: zoneId, isActive: true },
    });

    if (!zone) {
      throw new NotFoundException(`Zone with id ${zoneId} not found`);
    }

    const bodyPart = await this.bodyPartRepository.findOne({
      where: { id: bodyPartId, isActive: true },
    });

    if (!bodyPart) {
      throw new NotFoundException(`BodyPart with id ${bodyPartId} not found`);
    }

    const atAgent = await this.bodyPartRepository.findOne({
      where: { id: atAgentId, isActive: true },
    });

    if (!atAgent) {
      throw new NotFoundException(`AtAgent with id ${atAgentId} not found`);
    }

    const typeOfInjury = await this.typeOfInjuryRepository.findOne({
      where: { id: typeOfInjuryId, isActive: true },
    });

    if (!typeOfInjury) {
      throw new NotFoundException(
        `TypeOfInjury with id ${typeOfInjuryId} not found`,
      );
    }

    const atMechanism = await this.atMechanismRepository.findOne({
      where: { id: atMechanismId, isActive: true },
    });

    if (!atMechanism) {
      throw new NotFoundException(
        `AtMechanism with id ${atMechanismId} not found`,
      );
    }

    const workingDay = await this.workingDayRepository.findOne({
      where: { id: workingDayId, isActive: true },
    });

    if (!workingDay) {
      throw new NotFoundException(
        `WorkingDay with id ${workingDayId} not found`,
      );
    }

    const typeOfLink = await this.typeOfLinkRepository.findOne({
      where: { id: typeOfLinkId, isActive: true },
    });

    if (!typeOfLink) {
      throw new NotFoundException(
        `TypeOfLink with id ${typeOfLinkId} not found`,
      );
    }

    const accidentPosition = await this.accidentPositionRepository.findOne({
      where: { id: accidentPositionId, isActive: true },
    });

    if (!accidentPosition) {
      throw new NotFoundException(
        `AccidentPosition with id ${accidentPositionId} not found`,
      );
    }

    let machine: Machine;
    if (machineId) {
      machine = await this.machineRepository.findOne({
        where: { id: machineId, isActive: true },
      });
      if (!machine) {
        throw new NotFoundException(`Machine with id ${machineId} not found`);
      }
    } else if (machineName) {
      machine = await this.machineRepository.save({ name: machineName });
    }

    const associatedTask = await this.associatedTaskRepository.findOne({
      where: { id: associatedTaskId, isActive: true },
    });

    if (!associatedTask) {
      throw new NotFoundException(
        `AssociatedTask with id ${associatedTaskId} not found`,
      );
    }

    const areaLeader = await this.userRepository.findOne({
      where: { id: areaLeaderId, isActive: true },
    });

    if (!areaLeader) {
      throw new NotFoundException(
        `AreaLeader with id ${areaLeaderId} not found`,
      );
    }

    const riskFactor = await this.riskFactorRepository.findOne({
      where: { id: riskFactorId, isActive: true },
    });

    if (!riskFactor) {
      throw new NotFoundException(
        `RiskFactor with id ${riskFactorId} not found`,
      );
    }

    const natureOfEvent = await this.natureOfEventRepository.findOne({
      where: { id: natureOfEventsId, isActive: true },
    });

    if (!natureOfEvent) {
      throw new NotFoundException(
        `NatureOfEvent with id ${natureOfEventsId} not found`,
      );
    }

    let manager: User;
    if (managerId) {
      manager = await this.userRepository.findOne({
        where: { id: managerId, isActive: true },
      });

      if (!manager) {
        throw new NotFoundException(`Manager with id ${managerId} not found`);
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

  findAll() {
    return this.ciaelRepository.find({
      select: this.select,
      relations: this.relations,
      order: { createdAt: 'DESC' },
    });
  }

  findOne(id: number) {
    return this.ciaelRepository.findOne({
      where: { id },
      select: this.select,
      relations: this.relations,
    });
  }

  update(id: number, updateCiaelDto: UpdateCiaelDto) {
    return { id, updateCiaelDto };
  }

  remove(id: number) {
    return `This action removes a #${id} ciael`;
  }

  async seed() {
    return {
      message: 'Seed method called',
    };
  }
}
