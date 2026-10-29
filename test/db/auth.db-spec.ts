/**
 * E2E (app completa + base de pruebas): autenticación.
 *
 * Una app por archivo: cada archivo corre en su propio proceso (ver
 * README.md). Antes compartía archivo con usuarios (dos apps en el mismo
 * proceso).
 */
import request from 'supertest';

import { createE2eApp, type E2eApp } from './e2e-app.js';
import { TEST_PASSWORD } from './fixtures.js';

describe('E2E: auth', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  afterAll(() => e2e?.close());

  describe('POST /auth/login', () => {
    it('con credenciales correctas responde la cookie de sesión y el token', async () => {
      const res = await e2e
        .call('post', '/auth/login')
        .send({ email: 'general@hallazgos.test', password: TEST_PASSWORD })
        .expect(201);

      expect(res.body.token).toEqual(expect.any(String));
      expect(res.headers['set-cookie'][0]).toMatch(/^token=.+HttpOnly/i);
    });

    it.each([
      [
        'contraseña incorrecta',
        { email: 'general@hallazgos.test', password: 'otra' },
      ],
      [
        'correo que no existe',
        { email: 'nadie@hallazgos.test', password: TEST_PASSWORD },
      ],
    ])('con %s responde 401 genérico', async (_c, body) => {
      const res = await e2e.call('post', '/auth/login').send(body).expect(401);

      expect(res.body.message).toBe('Credenciales no válidas');
      // Distinto de la sesión terminada: la UI no muestra el diálogo.
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    it.each([
      ['sin token', undefined],
      ['con un token que no es válido', 'no-es-un-jwt'],
    ])(
      'una petición %s responde 401 SESSION_EXPIRED con el mensaje de sesión terminada',
      async (_c, token) => {
        const res = await e2e.call('get', '/zones', token).expect(401);

        expect(res.body).toMatchObject({
          statusCode: 401,
          code: 'SESSION_EXPIRED',
          message: 'Tu sesión terminó. Inicia sesión de nuevo.',
        });
      },
    );

    it('sin datos responde 400', async () => {
      await e2e.call('post', '/auth/login').send({}).expect(400);
    });
  });

  describe('app key y sesión', () => {
    it.each([
      ['sin sesión', undefined],
      ['con un token que ya no sirve', 'no-es-un-jwt'],
    ])(
      'logout %s borra la cookie (la UI la limpia tras "Tu sesión terminó")',
      async (_c, token) => {
        const res = await e2e
          .call('post', '/auth/logout', token)
          .set('Cookie', 'token=vencido')
          .expect(201);

        expect(String(res.headers['set-cookie'])).toMatch(/token=;.*Max-Age=0/);
      },
    );

    it('sin app key responde 400 aunque la ruta sea pública', async () => {
      await request(e2e.server)
        .post('/api/v1/auth/login')
        .send({ email: 'general@hallazgos.test', password: TEST_PASSWORD })
        .expect(400, /API Key es requerido/);
    });

    it('con una app key distinta responde 400', async () => {
      await request(e2e.server)
        .get('/api/v1/users/supervisors')
        .set('x-app-key', 'otra')
        .expect(400, /API Key es inválido/);
    });

    it('sin token responde 401 y con un token alterado también', async () => {
      await e2e.call('get', '/users/supervisors').expect(401);
      await e2e
        .call('get', '/users/supervisors', `${e2e.tokens.general}x`)
        .expect(401);
    });

    it('/health es público (sin app key ni token)', async () => {
      const res = await request(e2e.server).get('/api/v1/health').expect(200);

      expect(res.body.database).toBe('up');
    });

    it('check-token con sesión responde válido y sin token 401', async () => {
      const res = await e2e
        .call('post', '/auth/check-token', e2e.tokens.general)
        .expect(201);

      expect(res.body).toEqual({ message: 'Token válido.' });
      await e2e.call('post', '/auth/check-token').expect(401);
    });

    it('forgot-password responde lo mismo exista o no el correo y solo avisa al existente', async () => {
      const existing = await e2e
        .call('post', '/auth/forgot-password')
        .send({ email: 'general@hallazgos.test' })
        .expect(201);
      const missing = await e2e
        .call('post', '/auth/forgot-password')
        .send({ email: 'nadie@hallazgos.test' })
        .expect(201);

      expect(existing.body).toEqual(missing.body);
      expect(e2e.mail.sendForgotPassword).toHaveBeenCalledTimes(1);
    });
  });
});
