/**
 * E2E (app completa + base de pruebas): Gemba Walk.
 *
 * Una app por archivo: cada archivo corre en su propio proceso (ver
 * README.md). Antes compartía archivo con extintores (dos apps en el mismo
 * proceso) y fallaba de forma intermitente.
 */
import { randomUUID } from 'crypto';

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

    const body = {
      gembaWalkCalendarId: eventId,
      startToken: start.body.startToken,
      results: evaluationIds.map((id, i) => ({
        gembaWalkEvaluationId: id,
        isCompliant: i === 0,
        comments: i === 0 ? '' : 'Pasillo obstruido',
      })),
    };
    const key = randomUUID();
    const walk = await e2e
      .call('post', '/gemba-walk/walks', e2e.tokens.supervisor)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
    expect(walk.body.results).toHaveLength(2);

    // Reintento con la misma clave (p. ej. borrador reenviado tras un corte):
    // el mismo recorrido, sin registrar otro ni responder "ya registrado".
    const retry = await e2e
      .call('post', '/gemba-walk/walks', e2e.tokens.supervisor)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body.id).toBe(walk.body.id);

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
