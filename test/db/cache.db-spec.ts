/**
 * E2E (app completa + base de pruebas): caché de catálogos, dashboard y
 * usuario en sesión con un
 * Redis en memoria. Lo que importa es la invalidación con TypeORM real: que
 * llegue con cada forma de escribir y después del COMMIT.
 */
import { Evidence } from '../../src/evidences/entities/evidence.entity.js';
import { User } from '../../src/users/entities/user.entity.js';
import { Zone } from '../../src/zones/entities/zone.entity.js';
import { memoryCacheClient } from '../utils/index.js';
import { createE2eApp, type E2eApp } from './e2e-app.js';
import { countMatching, recordQueries } from './query-recorder.js';
import { saveEvidence } from './fixtures.js';

describe('E2E: caché Redis de catálogos y dashboard', () => {
  let e2e: E2eApp;
  const redis = memoryCacheClient();
  const generation = (namespace: string) =>
    Number(redis.store.get(`cache:gen:${namespace}`) ?? 0);

  beforeAll(async () => {
    e2e = await createE2eApp({ cacheClient: redis });
  });

  afterAll(() => e2e?.close());

  const zones = () =>
    e2e
      .call('get', '/zones?view=options', e2e.tokens.general)
      .expect(200)
      .then(({ body }) => body as { id: number; name: string }[]);

  it('un catálogo se consulta una vez y luego sale del caché', async () => {
    const first = await recordQueries(zones);
    const second = await recordQueries(zones);

    expect(countMatching(first, /FROM "zones"/)).toBe(1);
    expect(countMatching(second, /FROM "zones"/)).toBe(0);
  });

  it('editar una zona por la API invalida y la lista trae el nombre nuevo', async () => {
    await zones();
    const { id } = e2e.base.zone;

    await e2e
      .call('patch', `/zones/${id}`, e2e.tokens.admin)
      .send({ name: 'Pasillo renombrado' })
      .expect(200);

    expect((await zones()).find((zone) => zone.id === id).name).toBe(
      'Pasillo renombrado',
    );
  });

  it('dentro de una transacción invalida hasta el COMMIT; un ROLLBACK no', async () => {
    const repository = e2e.dataSource.getRepository(Zone);
    const before = generation('catalogs');

    await e2e.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(Zone)
        .update(e2e.base.zone.id, { name: 'En transacción' });
      // Todavía sin COMMIT: otra lectura no debe guardar datos viejos bajo
      // una generación nueva.
      expect(generation('catalogs')).toBe(before);
    });
    expect(generation('catalogs')).toBe(before + 1);

    await expect(
      e2e.dataSource.transaction(async (manager) => {
        await manager
          .getRepository(Zone)
          .update(e2e.base.zone.id, { name: 'Revertido' });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(generation('catalogs')).toBe(before + 1);
    expect((await repository.findOneBy({ id: e2e.base.zone.id })).name).toBe(
      'En transacción',
    );
  });

  it('save, update y relaciones ManyToMany fuera de transacción también invalidan', async () => {
    const dashboard = generation('dashboard');
    const evidence = await saveEvidence(e2e.dataSource, e2e.base);
    const afterSave = generation('dashboard');
    expect(afterSave).toBeGreaterThan(dashboard);

    await e2e.dataSource
      .getRepository(Evidence)
      .update(evidence.id, { description: 'cambio' });
    expect(generation('dashboard')).toBe(afterSave + 1);

    await e2e.dataSource
      .createQueryBuilder()
      .relation(Evidence, 'responsibles')
      .of(evidence.id)
      .add(e2e.base.users.supervisor.id);
    expect(generation('dashboard')).toBe(afterSave + 2);
  });

  it('el dashboard sale del caché hasta que cambia un hallazgo', async () => {
    const status = () =>
      e2e
        .call(
          'get',
          `/dashboard/status-by-filters?manufacturingPlantId=${e2e.base.plants.tepotzotlan.id}&startDate=01/01/2026&endDate=31/12/2026`,
          e2e.tokens.general,
        )
        .expect(200);

    await status();
    expect(countMatching(await recordQueries(status), /FROM "evidence"/)).toBe(
      0,
    );

    await saveEvidence(e2e.dataSource, e2e.base);

    expect(
      countMatching(await recordQueries(status), /FROM "evidence"/),
    ).toBeGreaterThan(0);
  });

  // Usuario de cada petición (JwtMiddleware → UsersService.findSessionUser).
  const sessionQueries = (token: string) =>
    recordQueries(() =>
      e2e.call('get', '/zones?view=options', token).expect(200),
    );
  const SESSION_SQL = /LEFT JOIN "user_manufacturing_plants"/;

  it('el usuario en sesión se consulta una vez y luego sale del caché', async () => {
    await sessionQueries(e2e.tokens.supervisor);
    expect(
      countMatching(await sessionQueries(e2e.tokens.supervisor), SESSION_SQL),
    ).toBe(0);
  });

  it('cambiar las plantas de un usuario invalida su sesión (tabla intermedia)', async () => {
    await sessionQueries(e2e.tokens.supervisor);
    const before = generation('sessions');

    await e2e.dataSource
      .createQueryBuilder()
      .relation(User, 'manufacturingPlants')
      .of(e2e.base.users.supervisor.id)
      .add(e2e.base.plants.manizales.id);

    expect(generation('sessions')).toBe(before + 1);
    expect(
      countMatching(await sessionQueries(e2e.tokens.supervisor), SESSION_SQL),
    ).toBeGreaterThan(0);
  });

  // Al final: deja sin validez el token de este usuario en el archivo.
  it('cerrar sesión en todos los dispositivos invalida al momento, aunque estuviera en caché', async () => {
    await sessionQueries(e2e.tokens.general);

    await e2e.call('post', '/auth/logout-all', e2e.tokens.general).expect(201);

    await e2e
      .call('get', '/zones?view=options', e2e.tokens.general)
      .expect(401);
  });
});
