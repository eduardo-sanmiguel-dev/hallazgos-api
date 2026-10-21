import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FindOperator, type ObjectLiteral } from 'typeorm';

import {
  buildUser,
  createServiceTestingModule,
  type RepositoryMock,
  runAsUser,
} from '../../test/utils/index.js';
import { AccidentPosition } from '../accident-positions/entities/accident-position.entity.js';
import { Area } from '../areas/entities/area.entity.js';
import { AssociatedTask } from '../associated-tasks/entities/associated-task.entity.js';
import { AtAgent } from '../at-agents/entities/at-agent.entity.js';
import { AtMechanism } from '../at-mechanisms/entities/at-mechanism.entity.js';
import { BodyPart } from '../body-parts/entities/body-part.entity.js';
import { CieDiagnosis } from '../cie-diagnoses/entities/cie-diagnosis.entity.js';
import { Country } from '../countries/entities/country.entity.js';
import { Employee, EmployeeArea } from '../employees/entities/index.js';
import { Genre } from '../genres/entities/genre.entity.js';
import { Machine } from '../machines/entities/machine.entity.js';
import { ManufacturingPlant } from '../manufacturing-plants/entities/manufacturing-plant.entity.js';
import { NatureOfEvent } from '../nature-of-events/entities/nature-of-event.entity.js';
import { RiskFactor } from '../risk-factors/entities/risk-factor.entity.js';
import { TypeOfInjury } from '../type-of-injuries/entities/type-of-injury.entity.js';
import { TypeOfLink } from '../type-of-links/entities/type-of-link.entity.js';
import { TypesOfEvent } from '../types-of-events/entities/types-of-event.entity.js';
import { User } from '../users/entities/user.entity.js';
import { WorkingDay } from '../working-days/entities/working-day.entity.js';
import { Zone } from '../zones/entities/zone.entity.js';
import { Ciael } from './entities/ciael.entity.js';
import { CiaelsService } from './ciaels.service.js';

/** Catálogos que create valida (todos deben existir y estar activos). */
const CATALOGS = {
  manufacturingPlantId: [ManufacturingPlant, 'ManufacturingPlant'],
  typeOfEventId: [TypesOfEvent, 'TypesOfEvent'],
  employeeId: [Employee, 'Employee'],
  cieDiagnosisId: [CieDiagnosis, 'CieDiagnosis'],
  zoneId: [Zone, 'Zone'],
  bodyPartId: [BodyPart, 'BodyPart'],
  atAgentId: [AtAgent, 'AtAgent'],
  typeOfInjuryId: [TypeOfInjury, 'TypeOfInjury'],
  atMechanismId: [AtMechanism, 'AtMechanism'],
  workingDayId: [WorkingDay, 'WorkingDay'],
  typeOfLinkId: [TypeOfLink, 'TypeOfLink'],
  accidentPositionId: [AccidentPosition, 'AccidentPosition'],
  associatedTaskId: [AssociatedTask, 'AssociatedTask'],
  riskFactorId: [RiskFactor, 'RiskFactor'],
  natureOfEventsId: [NatureOfEvent, 'NatureOfEvent'],
} as const;

describe('CiaelsService', () => {
  let service: CiaelsService;
  let repo: <E extends ObjectLiteral>(entity: new () => E) => RepositoryMock<E>;
  let ciaels: RepositoryMock<Ciael>;

  const creator = buildUser({ id: 10 });

  const dto = {
    manufacturingPlantId: 1,
    typeOfEventId: 2,
    description: 'Golpe en mano',
    employeeId: 3,
    eventDate: new Date('2026-10-01'),
    cieDiagnosisId: 4,
    daysOfDisability: 2,
    accidentPositionId: 5,
    zoneId: 6,
    bodyPartId: 7,
    atAgentId: 8,
    typeOfInjuryId: 9,
    atMechanismId: 10,
    workingDayId: 11,
    timeWorked: 4,
    usualWork: true,
    typeOfLinkId: 12,
    isDeath: false,
    machineId: 13,
    isInside: true,
    associatedTaskId: 14,
    areaLeaderId: 15,
    riskFactorId: 16,
    natureOfEventsId: 17,
  };

  beforeEach(async () => {
    const testing = await createServiceTestingModule(CiaelsService, {
      repositories: [
        Ciael,
        Area,
        AtAgent,
        ManufacturingPlant,
        TypesOfEvent,
        Employee,
        CieDiagnosis,
        Zone,
        BodyPart,
        TypeOfInjury,
        AtMechanism,
        WorkingDay,
        TypeOfLink,
        AccidentPosition,
        Machine,
        AssociatedTask,
        User,
        RiskFactor,
        NatureOfEvent,
        Country,
        Genre,
        EmployeeArea,
      ],
    });
    service = testing.service;
    repo = testing.repository;
    ciaels = repo(Ciael);

    // Cada catálogo encuentra el registro pedido (activo).
    for (const entity of [
      ...Object.values(CATALOGS).map(([e]) => e),
      Machine,
      User,
    ]) {
      repo(entity as new () => ObjectLiteral).findOne.mockImplementation(
        async ({ where }) => ({ id: (where as { id: number }).id, name: 'x' }),
      );
    }
    repo(Employee).findOne.mockResolvedValue({
      id: 3,
      dateOfAdmission: new Date(
        new Date().getFullYear() - 2,
        new Date().getMonth(),
        1,
      ),
    } as Employee);
    ciaels.save.mockImplementation(async (c) => ({ id: 99, ...c }) as never);
    ciaels.findOne.mockImplementation(
      async ({ where }) => ({ ...(where as object) }) as never,
    );
  });

  const create = (body: object = dto) =>
    runAsUser(creator, () => service.create(body as never));

  describe('create', () => {
    it('guarda el registro con sus catálogos, quien lo crea y la antigüedad en meses', async () => {
      await expect(create()).resolves.toMatchObject({ id: 99 });

      const saved = ciaels.save.mock.calls[0][0] as Record<string, unknown>;
      expect(saved).toMatchObject({
        description: 'Golpe en mano',
        daysOfDisability: 2,
        usualWork: true,
        isDeath: false,
        isInside: true,
        monthsOfSeniority: 24,
        createdBy: expect.objectContaining({ id: creator.id }),
        atAgent: { id: 8, name: 'x' },
        machine: { id: 13, name: 'x' },
        areaLeader: { id: 15, name: 'x' },
      });
      expect(saved).not.toHaveProperty('manager');
    });

    it('valida el agente en su propio catálogo (antes usaba el de partes del cuerpo)', async () => {
      await create();

      expect(repo(AtAgent).findOne).toHaveBeenCalledWith({
        where: { id: 8, isActive: true },
      });
      expect(repo(BodyPart).findOne).toHaveBeenCalledTimes(1);
    });

    it.each(Object.entries(CATALOGS))(
      'si no existe %s responde 404 sin guardar',
      async (field, [entity, label]) => {
        repo(entity as new () => ObjectLiteral).findOne.mockResolvedValue(null);

        await expect(create()).rejects.toThrow(
          new NotFoundException(
            `${label} with id ${dto[field as keyof typeof dto]} not found`,
          ),
        );
        expect(ciaels.save).not.toHaveBeenCalled();
      },
    );

    it('sin máquina (ni id ni nombre) responde 400 (antes 404)', async () => {
      const { machineId: _omit, ...withoutMachine } = dto;

      await expect(create(withoutMachine)).rejects.toThrow(
        new BadRequestException('Machine id or name is required'),
      );
    });

    it('una máquina inexistente responde 404', async () => {
      repo(Machine).findOne.mockResolvedValue(null);

      await expect(create()).rejects.toThrow(
        new NotFoundException('Machine with id 13 not found'),
      );
    });

    it('con nombre de máquina nueva la crea', async () => {
      const { machineId: _omit, ...withName } = dto;
      repo(Machine).save.mockResolvedValue({
        id: 70,
        name: 'Prensa',
      } as Machine);

      await create({ ...withName, machineName: 'Prensa' });

      expect(repo(Machine).save).toHaveBeenCalledWith({ name: 'Prensa' });
      expect(ciaels.save.mock.calls[0][0]).toMatchObject({
        machine: { id: 70, name: 'Prensa' },
      });
    });

    it('el líder de área debe existir', async () => {
      repo(User).findOne.mockResolvedValue(null);

      await expect(create()).rejects.toThrow(
        new NotFoundException('AreaLeader with id 15 not found'),
      );
    });

    it('con gerente lo valida y lo guarda', async () => {
      await create({ ...dto, managerId: 20 });

      expect(ciaels.save.mock.calls[0][0]).toMatchObject({
        manager: { id: 20, name: 'x' },
      });
    });

    it('un gerente inexistente responde 404', async () => {
      repo(User).findOne.mockImplementation(async ({ where }) =>
        (where as { id: number }).id === 20 ? null : ({ id: 15 } as User),
      );

      await expect(create({ ...dto, managerId: 20 })).rejects.toThrow(
        new NotFoundException('Manager with id 20 not found'),
      );
    });

    it('sin días de incapacidad ni fecha de ingreso no los guarda', async () => {
      repo(Employee).findOne.mockResolvedValue({ id: 3 } as Employee);

      await create({ ...dto, daysOfDisability: undefined });

      const saved = ciaels.save.mock.calls[0][0] as Record<string, unknown>;
      expect(saved).not.toHaveProperty('daysOfDisability');
      expect(saved.monthsOfSeniority).toBeNull();
    });
  });

  describe('listados y filtros', () => {
    const whereOf = (mock: { mock: { calls: unknown[][] } }) =>
      (mock.mock.calls[0][0] as { where: Record<string, unknown>[] }).where;

    it('sin filtros consulta todo, del más reciente al más antiguo', async () => {
      await service.findAll();

      expect(whereOf(ciaels.find)).toEqual([{}]);
      expect(ciaels.find.mock.calls[0][0].order).toEqual({
        createdAt: 'DESC',
        id: 'DESC',
      });
    });

    it('filtra por planta, tipo de evento, zona y rango de fechas', async () => {
      await service.findAll({
        manufacturingPlantId: 1,
        typeOfEventId: 2,
        zoneId: 3,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });

      const [where] = whereOf(ciaels.find);
      expect(where).toMatchObject({
        manufacturingPlant: { id: 1 },
        typeOfEvent: { id: 2 },
        zone: { id: 3 },
      });
      const eventDate = where.eventDate as FindOperator<unknown>;
      expect(eventDate.getSql('d')).toBe('d >= :startDate AND d <= :endDate');
      expect(eventDate.objectLiteralParameters).toEqual({
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });
    });

    it('solo fecha final compara hasta ese día', async () => {
      await service.findAll({ endDate: '2026-12-31' });

      const eventDate = whereOf(ciaels.find)[0]
        .eventDate as FindOperator<unknown>;
      expect(eventDate.getSql('d')).toBe('d <= :endDate');
    });

    it('buscar colaborador busca por nombre o por número', async () => {
      await service.findAll({ employee: '  Ana ' });

      const [byName, byCode] = whereOf(ciaels.find) as {
        employee: { name?: FindOperator<string>; code?: FindOperator<string> };
      }[];
      expect(byName.employee.name.value).toBe('%Ana%');
      expect(byCode.employee.code.getSql('c')).toBe(
        'CAST(c AS TEXT) ILIKE :code',
      );
      expect(byCode.employee.code.objectLiteralParameters).toEqual({
        code: '%Ana%',
      });
    });

    it('paginado aplica skip/take y devuelve el total', async () => {
      ciaels.findAndCount.mockResolvedValue([[{ id: 1 }] as never, 31]);

      await expect(
        service.findAllPaginated({ page: 3, limit: 10 }),
      ).resolves.toEqual({ data: [{ id: 1 }], count: 31 });
      expect(ciaels.findAndCount.mock.calls[0][0]).toMatchObject({
        take: 10,
        skip: 20,
      });
    });

    it('paginado con limit -1 (o sin límite) devuelve todo', async () => {
      await service.findAllPaginated({});

      expect(ciaels.findAndCount.mock.calls[0][0]).not.toHaveProperty('take');
    });
  });

  describe('findOne', () => {
    it('devuelve el registro', async () => {
      await expect(service.findOne(5)).resolves.toMatchObject({ id: 5 });
    });

    it('uno inexistente responde 404 (antes 200 sin cuerpo)', async () => {
      ciaels.findOne.mockResolvedValue(null);

      await expect(service.findOne(5)).rejects.toThrow(
        new NotFoundException('Ciael with id 5 not found'),
      );
    });
  });

  it('getPlantMx busca la planta de Tepotzotlán', async () => {
    await service.getPlantMx();

    expect(repo(ManufacturingPlant).find).toHaveBeenCalledWith({
      where: { name: 'Tepotzotlán' },
    });
  });
});
