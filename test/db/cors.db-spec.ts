/**
 * E2E (app completa + base de pruebas): CORS entre la UI y la API, que viven
 * en dominios distintos.
 */
import request from 'supertest';

import { API, createE2eApp, type E2eApp, UI_ORIGIN } from './e2e-app.js';

describe('E2E: CORS con la UI', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  afterAll(() => e2e?.close());

  it('el preflight se recuerda 2 horas (antes, una ida y vuelta extra por lectura)', async () => {
    const res = await request(e2e.server)
      .options(`${API}/zones`)
      .set('Origin', UI_ORIGIN())
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'traceparent')
      .expect(204);

    expect(res.headers).toMatchObject({
      'access-control-allow-origin': UI_ORIGIN(),
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'traceparent',
      'access-control-max-age': '7200',
    });
  });

  it('las lecturas dejan ver sus tiempos solo a la UI (RUM)', async () => {
    const res = await e2e
      .call('get', '/main-types', e2e.tokens.admin)
      .expect(200);

    expect(res.headers['timing-allow-origin']).toBe(UI_ORIGIN());
    expect(res.headers['access-control-allow-origin']).toBe(UI_ORIGIN());
  });
});
