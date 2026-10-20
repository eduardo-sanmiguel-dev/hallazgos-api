/**
 * E2E (app completa + base de pruebas): CIAEL y sus catálogos (P4).
 */
import { ObjectLiteral } from 'typeorm';

import { AccidentPosition } from 'accident-positions/entities/accident-position.entity';
import { AssociatedTask } from 'associated-tasks/entities/associated-task.entity';
import { AtAgent } from 'at-agents/entities/at-agent.entity';
import { AtMechanism } from 'at-mechanisms/entities/at-mechanism.entity';
import { BodyPart } from 'body-parts/entities/body-part.entity';
import { CieDiagnosis } from 'cie-diagnoses/entities/cie-diagnosis.entity';
import { Employee, EmployeeArea, EmployeePosition } from 'employees/entities';
import { Genre } from 'genres/entities/genre.entity';
import { Machine } from 'machines/entities/machine.entity';
import { NatureOfEvent } from 'nature-of-events/entities/nature-of-event.entity';
import { RiskFactor } from 'risk-factors/entities/risk-factor.entity';
import { TypeOfInjury } from 'type-of-injuries/entities/type-of-injury.entity';
import { TypeOfLink } from 'type-of-links/entities/type-of-link.entity';
import { TypesOfEvent } from 'types-of-events/entities/types-of-event.entity';
import { WorkingDay } from 'working-days/entities/working-day.entity';
import { createE2eApp, E2eApp } from './e2e-app';

/** Catálogos con su ruta; los marcados con planta se filtran por planta. */
const CATALOGS: [string, new () => ObjectLiteral, boolean][] = [
  ['/types-of-events', TypesOfEvent, false],
  ['/cie-diagnoses', CieDiagnosis, false],
  ['/body-parts', BodyPart, false],
  ['/at-agents', AtAgent, false],
  ['/type-of-injuries', TypeOfInjury, false],
  ['/at-mechanisms', AtMechanism, false],
  ['/working-days', WorkingDay, false],
  ['/type-of-links', TypeOfLink, false],
  ['/risk-factors', RiskFactor, false],
  ['/nature-of-events', NatureOfEvent, false],
  ['/accident-positions', AccidentPosition, true],
  ['/machines', Machine, true],
  ['/associated-tasks', AssociatedTask, true],
];

describe('E2E: CIAEL', () => {
  let e2e: E2eApp;
  const ids: Record<string, number> = {};
  let employee: Employee;

  beforeAll(async () => {
    e2e = await createE2eApp();
    const { tepotzotlan, manizales } = e2e.base.plants;

    for (const [path, entity, byPlant] of CATALOGS) {
      const repo = e2e.dataSource.getRepository(entity);
      const saved = await repo.save({
        name: `${path} activo`,
        ...(byPlant && { manufacturingPlants: [tepotzotlan] }),
      });
      await repo.save({ name: `${path} inactivo`, isActive: false });
      if (byPlant) {
        await repo.save({
          name: `${path} Colombia`,
          manufacturingPlants: [manizales],
        });
      }
      ids[path] = saved.id;
    }

    const area = await e2e.dataSource
      .getRepository(EmployeeArea)
      .save({ name: 'Producción' });
    const position = await e2e.dataSource
      .getRepository(EmployeePosition)
      .save({ name: 'Operador' });
    const gender = await e2e.dataSource
      .getRepository(Genre)
      .save({ name: 'Masculino' });
    // Las fechas de empleado son columnas date (texto YYYY-MM-DD).
    employee = await e2e.dataSource.getRepository(Employee).save({
      code: 789,
      name: 'Pedro Ruiz',
      birthdate: '1990-05-01' as unknown as Date,
      dateOfAdmission: '2024-01-01' as unknown as Date,
      area,
      position,
      gender,
      manufacturingPlants: [tepotzotlan],
    });
  });

  afterAll(() => e2e?.close());

  describe.each(CATALOGS)('catálogo %s', (path, _entity, byPlant) => {
    it('lista solo activos (y de la planta pedida si aplica); sin sesión 401', async () => {
      const res = await e2e
        .call(
          'get',
          byPlant ? `${path}?manufacturingPlantId=1` : path,
          e2e.tokens.general,
        )
        .expect(200);

      expect(res.body.map(({ name }) => name)).toEqual([`${path} activo`]);
      await e2e.call('get', path).expect(401);
    });
  });

  const ciael = () => ({
    manufacturingPlantId: e2e.base.plants.tepotzotlan.id,
    typeOfEventId: ids['/types-of-events'],
    description: 'Golpe en la mano con herramienta',
    employeeId: employee.id,
    eventDate: '2026-03-15',
    cieDiagnosisId: ids['/cie-diagnoses'],
    daysOfDisability: 2,
    accidentPositionId: ids['/accident-positions'],
    zoneId: e2e.base.zone.id,
    bodyPartId: ids['/body-parts'],
    atAgentId: ids['/at-agents'],
    typeOfInjuryId: ids['/type-of-injuries'],
    atMechanismId: ids['/at-mechanisms'],
    workingDayId: ids['/working-days'],
    timeWorked: 4,
    usualWork: true,
    typeOfLinkId: ids['/type-of-links'],
    isDeath: false,
    machineId: ids['/machines'],
    isInside: true,
    associatedTaskId: ids['/associated-tasks'],
    areaLeaderId: e2e.base.users.supervisor.id,
    riskFactorId: ids['/risk-factors'],
    natureOfEventsId: ids['/nature-of-events'],
  });

  it('registra un accidente y lo devuelve con sus catálogos', async () => {
    const res = await e2e
      .call('post', '/ciaels', e2e.tokens.admin)
      .send(ciael())
      .expect(201);

    expect(res.body).toMatchObject({
      description: 'Golpe en la mano con herramienta',
      eventDate: '2026-03-15',
      atAgent: { name: '/at-agents activo' },
      bodyPart: { name: '/body-parts activo' },
      employee: { name: 'Pedro Ruiz' },
    });

    const one = await e2e
      .call('get', `/ciaels/${res.body.id}`, e2e.tokens.admin)
      .expect(200);
    expect(one.body.id).toBe(res.body.id);
  });

  it('con una máquina nueva por nombre la crea', async () => {
    const { machineId: _omit, ...withoutMachine } = ciael();

    const res = await e2e
      .call('post', '/ciaels', e2e.tokens.admin)
      .send({ ...withoutMachine, machineName: 'Prensa nueva' })
      .expect(201);

    expect(res.body.machine.name).toBe('Prensa nueva');
  });

  it('sin máquina responde 400 y con un catálogo inactivo 404', async () => {
    const { machineId: _omit, ...withoutMachine } = ciael();
    await e2e
      .call('post', '/ciaels', e2e.tokens.admin)
      .send(withoutMachine)
      .expect(400);

    const [inactive] = await e2e.dataSource
      .getRepository(AtAgent)
      .findBy({ isActive: false });
    await e2e
      .call('post', '/ciaels', e2e.tokens.admin)
      .send({ ...ciael(), atAgentId: inactive.id })
      .expect(404, /AtAgent with id/);
  });

  it('lista paginada con filtros y descarga Excel', async () => {
    const list = await e2e
      .call(
        'get',
        '/ciaels?page=1&limit=10&employee=Pedro&startDate=2026-01-01',
        e2e.tokens.admin,
      )
      .expect(200);
    expect(list.body.count).toBeGreaterThanOrEqual(1);

    const excel = await e2e
      .call('get', '/ciaels/download/excel', e2e.tokens.admin)
      .expect(200);
    expect(excel.headers['content-disposition']).toContain('.xlsx');
  });

  it('un registro inexistente responde 404 y filtros inválidos 400', async () => {
    await e2e.call('get', '/ciaels/99999', e2e.tokens.admin).expect(404);
    await e2e
      .call('get', '/ciaels?startDate=15/03/2026', e2e.tokens.admin)
      .expect(400);
  });
});
