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
      // Anti-CSRF: no viaja en nada que empiece en otro sitio.
      expect(res.headers['set-cookie'][0]).toMatch(/SameSite=Strict/i);
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

  describe('origen y sesión', () => {
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

    // CSRF: un POST desde otro sitio llega con su Origin y se rechaza antes
    // de llegar al controlador, aunque traiga una sesión válida.
    it('un POST desde otro sitio responde 403 aunque traiga sesión', async () => {
      const res = await request(e2e.server)
        .post('/api/v1/auth/logout-all')
        .set('Origin', 'https://sitio-malicioso.example')
        .set('Authorization', `Bearer ${e2e.tokens.general}`)
        .expect(403);

      expect(res.body).toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN_ORIGIN',
      });
      // No cerró la sesión: la acción no se ejecutó.
      await e2e
        .call('get', '/users/supervisors', e2e.tokens.general)
        .expect(200);
    });

    // Fetch Metadata: un formulario o una imagen de otro sitio no siempre
    // manda Origin, pero el navegador sí marca Sec-Fetch-Site.
    it('una escritura sin Origin marcada de otro sitio responde 403 aunque traiga sesión', async () => {
      await request(e2e.server)
        .post('/api/v1/auth/logout-all')
        .set('Sec-Fetch-Site', 'cross-site')
        .set('Sec-Fetch-Mode', 'no-cors')
        .set('Authorization', `Bearer ${e2e.tokens.general}`)
        .expect(403, /FORBIDDEN_ORIGIN/);
      await e2e
        .call('get', '/users/supervisors', e2e.tokens.general)
        .expect(200);
    });

    it('otro sitio no puede leer el API como recurso; navegar a él sí llega', async () => {
      await request(e2e.server)
        .get('/api/v1/users/get-information-current-user')
        .set('Sec-Fetch-Site', 'cross-site')
        .set('Sec-Fetch-Mode', 'no-cors')
        .set('Authorization', `Bearer ${e2e.tokens.general}`)
        .expect(403, /FORBIDDEN_ORIGIN/);
      await request(e2e.server)
        .get('/api/v1/health')
        .set('Sec-Fetch-Site', 'cross-site')
        .set('Sec-Fetch-Mode', 'navigate')
        .expect((res) => expect(res.status).not.toBe(403));
    });

    it('el login desde otro sitio también responde 403', async () => {
      await request(e2e.server)
        .post('/api/v1/auth/login')
        .set('Origin', 'https://sitio-malicioso.example')
        .send({ email: 'general@hallazgos.test', password: TEST_PASSWORD })
        .expect(403, /FORBIDDEN_ORIGIN/);
    });

    // Con check-token y no con login: /auth/login permite 10 por minuto por
    // IP y este archivo ya usa casi todos.
    it('sin Origin (curl, scripts) y ya sin x-app-key un POST funciona', async () => {
      await request(e2e.server)
        .post('/api/v1/auth/check-token')
        .set('Authorization', `Bearer ${e2e.tokens.general}`)
        .expect(201, { message: 'Token válido.' });
    });

    it('un GET desde otro sitio no se bloquea aquí (CORS decide si se lee)', async () => {
      await request(e2e.server)
        .get('/api/v1/users/supervisors')
        .set('Origin', 'https://sitio-malicioso.example')
        .set('Authorization', `Bearer ${e2e.tokens.general}`)
        .expect(200);
    });

    it('sin token responde 401 y con un token alterado también', async () => {
      await e2e.call('get', '/users/supervisors').expect(401);
      await e2e
        .call('get', '/users/supervisors', `${e2e.tokens.general}x`)
        .expect(401);
    });

    it('/health es público (sin token)', async () => {
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
