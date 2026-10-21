/**
 * E2E (app completa + base de pruebas): Gemba Walk e inspecciones de
 * extintores.
 */
import { binaryParser } from '../utils/index.js';
import { createE2eApp, type E2eApp } from './e2e-app.js';

const inMinutes = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000).toISOString();

describe('E2E: Gemba Walk', () => {
  let e2e: E2eApp;
  let eventId: number;
  let evaluationIds: number[];

  beforeAll(async () => {
    e2e = await createE2eApp();
    const admin = e2e.tokens.admin;

    // El administrador configura zona, conceptos, observador y un evento de hoy.
    const zone = await e2e
      .call('post', '/gemba-walk/zones', admin)
      .send({
        manufacturingPlantId: 1,
        nameZone: 'Producción',
        nameLocation: 'Línea 1',
      })
      .expect(201);

    evaluationIds = [];
    for (const area of ['Orden', 'Seguridad']) {
      const evaluation = await e2e
        .call('post', '/gemba-walk/evaluations', admin)
        .send({
          manufacturingPlantId: 1,
          area,
          category: 'SHE',
          description: `${area} ok`,
        })
        .expect(201);
      evaluationIds.push(evaluation.body.id);
    }

    await e2e
      .call('post', '/gemba-walk/observers', admin)
      .send({
        manufacturingPlantId: 1,
        gembaWalkZoneId: zone.body.id,
        userIds: [e2e.base.users.supervisor.id],
      })
      .expect(201);

    const events = await e2e
      .call('post', '/gemba-walk/calendar', admin)
      .send({
        events: [{ gembaWalkZoneId: zone.body.id, scheduledAt: inMinutes(2) }],
      })
      .expect(201);
    eventId = events.body[0].id;
  });

  afterAll(() => e2e?.close());

  it('solo observadores (y el administrador) acceden al módulo', async () => {
    await e2e
      .call('get', '/gemba-walk/walks/access', e2e.tokens.supervisor)
      .expect(200, { isObserver: true });
    await e2e
      .call('get', '/gemba-walk/walks/access', e2e.tokens.general)
      .expect(200, { isObserver: false });
    await e2e.call('get', '/gemba-walk/walks', e2e.tokens.general).expect(403);
  });

  it('el observador inicia y registra el recorrido evaluando todos los conceptos', async () => {
    const available = await e2e
      .call(
        'get',
        '/gemba-walk/walks/available-events?manufacturingPlantId=1',
        e2e.tokens.supervisor,
      )
      .expect(200);
    expect(available.body.map(({ id }) => id)).toEqual([eventId]);

    const start = await e2e
      .call('post', '/gemba-walk/walks/start', e2e.tokens.supervisor)
      .send({ gembaWalkCalendarId: eventId })
      .expect(201);

    // Falta un concepto: 400.
    await e2e
      .call('post', '/gemba-walk/walks', e2e.tokens.supervisor)
      .send({
        gembaWalkCalendarId: eventId,
        startToken: start.body.startToken,
        results: [
          { gembaWalkEvaluationId: evaluationIds[0], isCompliant: true },
        ],
      })
      .expect(400);

    const walk = await e2e
      .call('post', '/gemba-walk/walks', e2e.tokens.supervisor)
      .send({
        gembaWalkCalendarId: eventId,
        startToken: start.body.startToken,
        results: evaluationIds.map((id, i) => ({
          gembaWalkEvaluationId: id,
          isCompliant: i === 0,
          comments: i === 0 ? '' : 'Pasillo obstruido',
        })),
      })
      .expect(201);
    expect(walk.body.results).toHaveLength(2);

    // El mismo evento no se registra dos veces.
    await e2e
      .call('post', '/gemba-walk/walks/start', e2e.tokens.supervisor)
      .send({ gembaWalkCalendarId: eventId })
      .expect(400, /ya tiene un recorrido registrado/);

    const detail = await e2e
      .call('get', `/gemba-walk/walks/${walk.body.id}`, e2e.tokens.supervisor)
      .expect(200);
    expect(detail.body.id).toBe(walk.body.id);
  });

  it('un comprobante inventado responde 400', async () => {
    await e2e
      .call('post', '/gemba-walk/walks', e2e.tokens.supervisor)
      .send({
        gembaWalkCalendarId: eventId,
        startToken: 'inventado',
        results: [
          { gembaWalkEvaluationId: evaluationIds[0], isCompliant: true },
        ],
      })
      .expect(400);
  });

  it('programar un evento en el pasado responde 400 y uno inexistente 404', async () => {
    await e2e
      .call('post', '/gemba-walk/calendar', e2e.tokens.admin)
      .send({ events: [{ gembaWalkZoneId: 1, scheduledAt: inMinutes(-60) }] })
      .expect(400);
    await e2e
      .call('get', '/gemba-walk/calendar/9999', e2e.tokens.admin)
      .expect(404);
  });
});

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
