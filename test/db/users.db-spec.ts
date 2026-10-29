/**
 * E2E (app completa + base de pruebas): usuarios.
 *
 * Una app por archivo: cada archivo corre en su propio proceso (ver
 * README.md). Antes compartía archivo con autenticación (dos apps en el mismo
 * proceso).
 */
import { createE2eApp, type E2eApp } from './e2e-app.js';
import { TEST_PASSWORD } from './fixtures.js';

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
      400,
    ],
    [
      'sin plantas',
      { ...newUser, email: 'x2@hallazgos.test', manufacturingPlantNames: [] },
      400,
    ],
    [
      'con una planta que no existe',
      {
        ...newUser,
        email: 'x3@hallazgos.test',
        manufacturingPlantNames: ['Marte'],
      },
      404,
    ],
  ])('rechaza crear %s', async (_c, body, status) => {
    await e2e
      .call('post', '/users', e2e.tokens.admin)
      .send(body)
      .expect(status);
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

  it('un usuario General no puede hacerse Administrador (403)', async () => {
    const { id } = e2e.base.users.generalColombia;

    await e2e
      .call('patch', `/users/${id}`, e2e.tokens.generalColombia)
      .send({ rule: 'Administrador', manufacturingPlantNames: ['Manizales'] })
      .expect(403);
  });
});
