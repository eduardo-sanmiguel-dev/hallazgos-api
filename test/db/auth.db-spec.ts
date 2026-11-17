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

  // Al final del archivo: revoca las sesiones de "general.co" (nadie más de
  // este archivo usa su token).
  describe('POST /auth/logout-all', () => {
    const email = 'general.co@hallazgos.test';
    const protectedRoute = (token: string) =>
      e2e.call('get', '/users/supervisors', token);

    it('sin sesión responde 401', async () => {
      await e2e.call('post', '/auth/logout-all').expect(401);
    });

    // Pocos logins: /auth/login permite 10 por minuto por IP y el arranque ya
    // hace 4. "laptop" es la sesión que abrió el arranque.
    it('cierra todas las sesiones del usuario (otros dispositivos incluidos) y no las de otros', async () => {
      const phone = await e2e.login(email);
      const laptop = e2e.tokens.generalColombia;
      await protectedRoute(phone).expect(200);
      await protectedRoute(laptop).expect(200);

      const res = await e2e.call('post', '/auth/logout-all', phone).expect(201);
      expect(res.body).toEqual({
        message: 'Sesión cerrada en todos los dispositivos.',
      });
      expect(String(res.headers['set-cookie'])).toMatch(/token=;.*Max-Age=0/);

      await protectedRoute(phone).expect(401);
      await protectedRoute(laptop).expect(401);
      await e2e.call('post', '/auth/check-token', laptop).expect(401);
      // Otro usuario no se ve afectado.
      await protectedRoute(e2e.tokens.general).expect(200);
    });

    it('después se puede volver a iniciar sesión, y un token revocado tampoco descarga fotos', async () => {
      const fresh = await e2e.login(email);
      await protectedRoute(fresh).expect(200);
      await e2e.call('post', '/auth/check-token', fresh).expect(201);

      await e2e.call('post', '/auth/logout-all', fresh).expect(201);

      // 401 por la sesión (no 404 por el archivo): se valida antes.
      await request(e2e.server)
        .get('/static/images/evidences/no-existe.png')
        .set('Authorization', `Bearer ${fresh}`)
        .expect(401);
    });
  });
});
