/**
 * E2E (app completa + base de pruebas): inspecciones de extintores.
 *
 * Una app por archivo: cada archivo corre en su propio proceso (ver
 * README.md). Antes compartía archivo con Gemba Walk (dos apps en el mismo
 * proceso) y fallaba de forma intermitente.
 */
import { binaryParser } from '../utils/index.js';
import { createE2eApp, type E2eApp } from './e2e-app.js';

describe('E2E: inspecciones de extintores', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  afterAll(() => e2e?.close());

  const evaluation = (overrides: object = {}) => ({
    location: 'Almacén norte',
    extinguisherNumber: 'F4E-321',
    typeOfExtinguisher: 'PQS',
    capacity: 6,
    pressureManometer: 'C',
    valve: 'C',
    hose: 'C',
    cylinder: 'C',
    barrette: 'C',
    seal: 'C',
    cornet: 'C',
    access: 'C',
    support: 'C',
    nextRechargeDate: '2099-12-01',
    maintenanceDate: '2099-11-01',
    observations: 'Sin novedad',
    ...overrides,
  });

  it('registra una inspección y descarga su formato (Excel)', async () => {
    const created = await e2e
      .call('post', '/extinguisher-inspections', e2e.tokens.supervisor)
      .send({ manufacturingPlantId: 1, evaluations: [evaluation()] })
      .expect(201);

    expect(created.body.responsible.email).toBe('supervisor@hallazgos.test');
    expect(created.body.evaluations).toHaveLength(1);

    const file = await e2e
      .call(
        'get',
        `/extinguisher-inspections/download/file/${created.body.id}`,
        e2e.tokens.supervisor,
      )
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    expect(file.body.subarray(0, 2).toString()).toBe('PK');
    expect(file.headers['content-type']).toContain('spreadsheetml');

    const list = await e2e
      .call(
        'get',
        '/extinguisher-inspections?page=1&limit=10&search=Supervisor',
        e2e.tokens.supervisor,
      )
      .expect(200);
    expect(list.body.count).toBe(1);
  });

  it('fechas pasadas responden 400 y datos inválidos también', async () => {
    await e2e
      .call('post', '/extinguisher-inspections', e2e.tokens.supervisor)
      .send({
        manufacturingPlantId: 1,
        evaluations: [evaluation({ maintenanceDate: '2020-01-01' })],
      })
      .expect(400, /anteriores a la fecha actual/);
    await e2e
      .call('post', '/extinguisher-inspections', e2e.tokens.supervisor)
      .send({
        manufacturingPlantId: 1,
        evaluations: [evaluation({ valve: 'OK' })],
      })
      .expect(400);
  });

  it('una inspección inexistente o eliminada responde 404; sin sesión 401', async () => {
    const created = await e2e
      .call('post', '/extinguisher-inspections', e2e.tokens.supervisor)
      .send({ manufacturingPlantId: 1, evaluations: [evaluation()] })
      .expect(201);

    await e2e
      .call(
        'delete',
        `/extinguisher-inspections/${created.body.id}`,
        e2e.tokens.supervisor,
      )
      .expect(200);
    await e2e
      .call(
        'get',
        `/extinguisher-inspections/${created.body.id}`,
        e2e.tokens.supervisor,
      )
      .expect(404);
    await e2e
      .call('get', '/extinguisher-inspections/9999', e2e.tokens.supervisor)
      .expect(404);
    await e2e.call('get', '/extinguisher-inspections').expect(401);
  });
});
