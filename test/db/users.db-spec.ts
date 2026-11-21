/**
 * E2E (app completa + base de pruebas): usuarios.
 *
 * Una app por archivo: cada archivo corre en su propio proceso (ver
 * README.md). Antes compartía archivo con autenticación (dos apps en el mismo
 * proceso).
 */
import { Zone } from '../../src/zones/entities/zone.entity.js';
import { createE2eApp, type E2eApp } from './e2e-app.js';
import { TEST_PASSWORD } from './fixtures.js';
import { countMatching, recordQueries } from './query-recorder.js';

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

  it('asignar muchas zonas y procesos los busca en una sola consulta (antes, dos por cada uno)', async () => {
    const { tepotzotlan, manizales } = e2e.base.plants;
    const extra = await e2e.dataSource.getRepository(Zone).save(
      ['Comedor', 'Patio - Sur', 'Andén 3'].map((name) => ({
        name,
        manufacturingPlant: tepotzotlan,
        createdBy: e2e.base.users.admin,
      })),
    );
    const zoneNames = [
      'Tepotzotlán - Pasillo norte',
      ...extra.map(({ name }) => `Tepotzotlán - ${name}`),
      `Manizales - Bodega`,
      'Tepotzotlán - No existe',
    ];
    const supervisor = {
      ...newUser,
      email: 'muchas-zonas@hallazgos.test',
      rule: 'Supervisor',
      manufacturingPlantNames: [tepotzotlan.name, manizales.name],
      zoneNames,
      processNames: ['Tepotzotlán - Producción', 'Manizales - Calidad'],
    };

    let id: number;
    const created = await recordQueries(async () => {
      ({
        body: { id },
      } = await e2e
        .call('post', '/users', e2e.tokens.admin)
        .send(supervisor)
        .expect(201));
    });
    const edited = await recordQueries(() =>
      e2e
        .call('patch', `/users/${id}`, e2e.tokens.admin)
        .send({ ...supervisor, password: '', zoneNames: zoneNames.slice(2) })
        .expect(200),
    );

    for (const queries of [created, edited]) {
      expect(countMatching(queries, /FROM "zones" "Zone"/)).toBe(1);
      expect(countMatching(queries, /FROM "processes" "Processes"/)).toBe(1);
    }
    const { body } = await e2e
      .call('get', `/users/${id}`, e2e.tokens.admin)
      .expect(200);
    // La que no existe se omite, como antes.
    expect(body.zones.map(({ name }) => name).sort()).toEqual(
      ['Andén 3', 'Bodega', 'Patio - Sur'].sort(),
    );
    expect(body.processes.map(({ name }) => name).sort()).toEqual([
      'Calidad',
      'Producción',
    ]);
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
