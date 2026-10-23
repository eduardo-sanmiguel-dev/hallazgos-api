/**
 * E2E (app completa + base de pruebas): EPP y equipos.
 */
import {
  Employee,
  EmployeeArea,
  EmployeePosition,
} from '../../src/employees/entities/index.js';
import { Equipment } from '../../src/equipments/entities/index.js';
import { Genre } from '../../src/genres/entities/genre.entity.js';
import { createE2eApp, type E2eApp } from './e2e-app.js';

// PNG de 1x1 como firma (data URL, como la manda el UI).
const SIGNATURE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('E2E: EPP y equipos', () => {
  let e2e: E2eApp;
  let employee: Employee;
  let employeeColombia: Employee;
  let casco: Equipment;
  let equipoColombia: Equipment;

  beforeAll(async () => {
    e2e = await createE2eApp();
    const repo = <T>(entity: new () => T) =>
      e2e.dataSource.getRepository(entity);
    const { tepotzotlan, manizales } = e2e.base.plants;

    const area = await repo(EmployeeArea).save({ name: 'Producción' });
    const position = await repo(EmployeePosition).save({ name: 'Operador' });
    const gender = await repo(Genre).save({ name: 'Femenino' });
    employee = await repo(Employee).save({
      code: 123,
      name: 'Ana Pérez',
      area,
      position,
      gender,
      manufacturingPlants: [tepotzotlan],
    });
    employeeColombia = await repo(Employee).save({
      code: 456,
      name: 'Luis Gómez',
      area,
      position,
      gender,
      manufacturingPlants: [manizales],
    });
    casco = await repo(Equipment).save({
      name: 'Casco',
      deliveryFrequency: 30,
      manufacturingPlant: tepotzotlan,
      createdBy: e2e.base.users.admin,
    });
    equipoColombia = await repo(Equipment).save({
      name: 'Guantes',
      manufacturingPlant: manizales,
      createdBy: e2e.base.users.admin,
    });
  });

  afterAll(() => e2e?.close());

  const delivery = (employeeId: number, equipmentId: number) => ({
    employeeId,
    signature: SIGNATURE,
    equipments: [{ id: equipmentId, quantity: 1, observations: 'talla M' }],
  });

  it('registra una entrega y aparece en la lista paginada de la planta', async () => {
    await e2e
      .call('post', '/epps', e2e.tokens.general)
      .send(delivery(employee.id, casco.id))
      .expect(201, { message: 'EPP created successfully' });

    const res = await e2e
      .call(
        'get',
        '/epps?manufacturingPlantId=1&page=1&limit=10',
        e2e.tokens.general,
      )
      .expect(200);

    expect(res.body.count).toBe(1);
    expect(res.body.data[0]).toMatchObject({ name: 'Ana Pérez' });
    expect(res.body.data[0].epps[0].equipments[0]).toMatchObject({
      quantity: 1,
      observations: 'talla M',
    });
  });

  it('con withHistory=false la lista no trae historial; se pide por colaborador', async () => {
    const list = await e2e
      .call(
        'get',
        '/epps?manufacturingPlantId=1&page=1&limit=10&withHistory=false',
        e2e.tokens.general,
      )
      .expect(200);

    expect(list.body.count).toBe(1);
    expect(list.body.data[0]).toMatchObject({
      id: employee.id,
      name: 'Ana Pérez',
      position: { name: 'Operador' },
      area: { name: 'Producción' },
    });
    expect(list.body.data[0]).not.toHaveProperty('epps');

    const history = await e2e
      .call(
        'get',
        `/epps/employees/${employee.id}/history?manufacturingPlantId=1`,
        e2e.tokens.general,
      )
      .expect(200);

    expect(history.body).toEqual([
      {
        id: expect.any(Number),
        // Mismo formato que tenía el historial dentro de la lista.
        deliveryDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        observations: 'talla M',
        equipment: { id: casco.id, name: 'Casco' },
        signature: SIGNATURE,
        createBy: {
          id: e2e.base.users.general.id,
          name: e2e.base.users.general.name,
        },
      },
    ]);
  });

  it('recién entregado: la frecuencia indica cuándo se puede volver a entregar', async () => {
    const res = await e2e
      .call(
        'get',
        `/epps/validate-delivery-frequency?equipmentId=${casco.id}&employeeId=${employee.id}`,
        e2e.tokens.general,
      )
      .expect(200);

    expect(res.body.canDeliver).toBe(false);
    expect(res.body.message).toMatch(/Faltan \d+ día\(s\)/);
  });

  it('descarga el formato de EPP del empleado (Excel)', async () => {
    const res = await e2e
      .call(
        'get',
        `/epps/download/file/${employee.id}?timeZone=America/Mexico_City`,
        e2e.tokens.general,
      )
      .expect(200);

    expect(res.headers['content-disposition']).toMatch(
      /EPP_Tepotzotlan_123_AnaPerez/,
    );
  });

  describe('plantas ajenas y errores', () => {
    it('el historial de un colaborador de otra planta, o de una planta ajena, responde 404', async () => {
      await e2e
        .call(
          'get',
          `/epps/employees/${employeeColombia.id}/history?manufacturingPlantId=1`,
          e2e.tokens.general,
        )
        .expect(404);
      await e2e
        .call(
          'get',
          `/epps/employees/${employee.id}/history?manufacturingPlantId=2`,
          e2e.tokens.general,
        )
        .expect(404);
    });

    it('entregar a un empleado de otra planta responde 404', async () => {
      await e2e
        .call('post', '/epps', e2e.tokens.general)
        .send(delivery(employeeColombia.id, casco.id))
        .expect(404);
    });

    it('entregar un equipo de otra planta responde 404', async () => {
      await e2e
        .call('post', '/epps', e2e.tokens.general)
        .send(delivery(employee.id, equipoColombia.id))
        .expect(404);
    });

    it('la lista de otra planta responde 404 y sin planta 400', async () => {
      await e2e
        .call('get', '/epps?manufacturingPlantId=2&page=1', e2e.tokens.general)
        .expect(404);
      await e2e.call('get', '/epps?page=1', e2e.tokens.general).expect(400);
    });

    it('descargar el formato de un empleado de otra planta o sin EPP responde 404', async () => {
      await e2e
        .call(
          'get',
          `/epps/download/file/${employeeColombia.id}`,
          e2e.tokens.general,
        )
        .expect(404);
      await e2e
        .call(
          'get',
          `/epps/download/file/${employeeColombia.id}`,
          e2e.tokens.generalColombia,
        )
        .expect(404, /no tiene EPP registrados/);
    });

    it('una entrega sin equipos o sin empleado responde 400 y sin sesión 401', async () => {
      await e2e
        .call('post', '/epps', e2e.tokens.general)
        .send({ ...delivery(employee.id, casco.id), equipments: [] })
        .expect(400);
      await e2e
        .call('post', '/epps', e2e.tokens.general)
        .send({ signature: SIGNATURE, equipments: [] })
        .expect(400);
      await e2e
        .call('post', '/epps')
        .send(delivery(employee.id, casco.id))
        .expect(401);
    });
  });

  describe('equipos', () => {
    it('lista sin planta = las del usuario; con planta ajena 404', async () => {
      const res = await e2e
        .call('get', '/equipments', e2e.tokens.general)
        .expect(200);

      expect(res.body.map(({ name }) => name)).toEqual(['Casco']);
      await e2e
        .call('get', '/equipments?manufacturingPlantId=2', e2e.tokens.general)
        .expect(404);
    });

    it('un equipo de otra planta no se ve, no se edita ni se borra (404)', async () => {
      await e2e
        .call('get', `/equipments/${equipoColombia.id}`, e2e.tokens.general)
        .expect(404);
      await e2e
        .call('patch', `/equipments/${equipoColombia.id}`, e2e.tokens.general)
        .send({ price: 10 })
        .expect(404);
      await e2e
        .call('delete', `/equipments/${equipoColombia.id}`, e2e.tokens.general)
        .expect(404);
    });

    it('crear con precio guarda el historial de costos', async () => {
      const created = await e2e
        .call('post', '/equipments', e2e.tokens.admin)
        .send({ name: 'Lentes', price: 50, manufacturingPlantId: 1 })
        .expect(201);

      expect(
        created.body.costHistory.map(({ price }) => Number(price)),
      ).toEqual([50]);
    });
  });
});
