/**
 * E2E (app completa + base de pruebas): autenticación y usuarios.
 */
import request from 'supertest';

import { createE2eApp, E2eApp } from './e2e-app';
import { TEST_PASSWORD } from './fixtures';

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
    });

    it('sin datos responde 400', async () => {
      await e2e.call('post', '/auth/login').send({}).expect(400);
    });
  });

  describe('app key y sesión', () => {
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

describe('E2E: usuarios', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  afterAll(() => e2e?.close());

  const newUser = {
    name: 'Nueva Persona',
    email: 'nueva@hallazgos.test',
    password: 'Clave-Nueva-1',
    rule: 'General',
    manufacturingPlantNames: ['Tepotzotlán'],
  };

  it('el administrador crea un usuario que puede iniciar sesión', async () => {
    await e2e
      .call('post', '/users', e2e.tokens.admin)
      .send(newUser)
      .expect(201);

    const res = await e2e
      .call('post', '/auth/login')
      .send({ email: newUser.email, password: newUser.password })
      .expect(201);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it.each([
    [
      'sin contraseña',
      { ...newUser, email: 'x1@hallazgos.test', password: '' },
    ],
    [
      'sin plantas',
      { ...newUser, email: 'x2@hallazgos.test', manufacturingPlantNames: [] },
    ],
    [
      'con una planta que no existe',
      {
        ...newUser,
        email: 'x3@hallazgos.test',
        manufacturingPlantNames: ['Marte'],
      },
    ],
  ])('crear %s responde 400', async (_c, body) => {
    await e2e.call('post', '/users', e2e.tokens.admin).send(body).expect(400);
  });

  it('editar sin cambiar la contraseña (como el UI) conserva la contraseña', async () => {
    const { id } = e2e.base.users.general;

    await e2e
      .call('patch', `/users/${id}`, e2e.tokens.admin)
      .send({
        name: 'General Editado',
        email: 'general@hallazgos.test',
        password: '',
        rule: 'General',
        manufacturingPlantNames: ['Tepotzotlán'],
      })
      .expect(200);

    await e2e
      .call('post', '/auth/login')
      .send({ email: 'general@hallazgos.test', password: TEST_PASSWORD })
      .expect(201);
  });

  it('lista ordenada solo por columnas permitidas', async () => {
    await e2e
      .call('get', '/users?orderBy=name|desc', e2e.tokens.admin)
      .expect(200);
    await e2e
      .call('get', '/users?orderBy=password|asc', e2e.tokens.admin)
      .expect(400);
  });

  it('un usuario inexistente responde 404', async () => {
    await e2e.call('get', '/users/9999', e2e.tokens.admin).expect(404);
  });

  it('información del usuario en sesión', async () => {
    const res = await e2e
      .call('get', '/users/get-information-current-user', e2e.tokens.supervisor)
      .expect(200);

    expect(res.body.email).toBe('supervisor@hallazgos.test');
    expect(res.body).not.toHaveProperty('password');
  });

  // PENDIENTE DE DECISIÓN (seguridad, ver docs/pendientes-seguridad.md):
  // el API no valida roles; hoy un usuario General puede cambiar su propio
  // rol a Administrador.
  it.failing(
    'un usuario General no puede hacerse Administrador (403)',
    async () => {
      const { id } = e2e.base.users.generalColombia;

      await e2e
        .call('patch', `/users/${id}`, e2e.tokens.generalColombia)
        .send({ rule: 'Administrador', manufacturingPlantNames: ['Manizales'] })
        .expect(403);
    },
  );
});
