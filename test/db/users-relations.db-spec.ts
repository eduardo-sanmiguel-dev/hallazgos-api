/**
 * E2E (app completa + base de pruebas): plantas, zonas y procesos de los
 * usuarios. Se cargan con una consulta por relación (relationLoadStrategy
 * 'query') y el servicio reaplica los filtros que antes hacía el JOIN: estas
 * pruebas cuidan que el resultado siga siendo el mismo.
 */
import { User } from '../../src/users/entities/user.entity.js';
import { ManufacturingPlant } from '../../src/manufacturing-plants/entities/manufacturing-plant.entity.js';
import { Zone } from '../../src/zones/entities/zone.entity.js';
import { createE2eApp, type E2eApp } from './e2e-app.js';

type UserBody = {
  email: string;
  manufacturingPlants: { name: string }[];
  zones?: { name: string; manufacturingPlant: { name: string } }[];
  processes?: { name: string; manufacturingPlant: { name: string } }[];
};

const names = (items: { name: string }[] = []) => items.map((i) => i.name);

describe('E2E: relaciones de usuarios', () => {
  let e2e: E2eApp;
  const byEmail = (body: UserBody[], email: string) =>
    body.find((user) => user.email === email) as UserBody;

  beforeAll(async () => {
    e2e = await createE2eApp();
    const { supervisor } = e2e.base.users;
    const relation = (name: string) =>
      e2e.dataSource.createQueryBuilder().relation(User, name).of(supervisor);

    // El supervisor también tiene la zona, el proceso y la planta de Colombia.
    await relation('zones').add(e2e.base.zoneColombia);
    await relation('processes').add(e2e.base.processColombia);
    await relation('manufacturingPlants').add(e2e.base.plants.manizales);
  });

  afterAll(() => e2e?.close());

  it('el listado completo trae plantas, zonas y procesos (con su planta), por nombre', async () => {
    const res = await e2e.call('get', '/users', e2e.tokens.admin).expect(200);
    const supervisor = byEmail(res.body, 'supervisor@hallazgos.test');

    expect(names(supervisor.manufacturingPlants)).toEqual([
      'Manizales',
      'Tepotzotlán',
    ]);
    expect(names(supervisor.zones)).toEqual(['Bodega', 'Pasillo norte']);
    expect(supervisor.zones?.[1].manufacturingPlant.name).toBe('Tepotzotlán');
    expect(names(supervisor.processes).sort()).toEqual([
      'Calidad',
      'Producción',
    ]);
    expect(
      supervisor.processes?.find((p) => p.name === 'Producción')
        ?.manufacturingPlant.name,
    ).toBe('Tepotzotlán');
  });

  it('filtrar por planta deja en cada usuario solo esa planta', async () => {
    const { tepotzotlan } = e2e.base.plants;
    const res = await e2e
      .call(
        'get',
        `/users?manufacturingPlantId=${tepotzotlan.id}`,
        e2e.tokens.admin,
      )
      .expect(200);

    expect(res.body.map((u: UserBody) => u.email)).not.toContain(
      'general.co@hallazgos.test',
    );
    for (const user of res.body as UserBody[]) {
      expect(names(user.manufacturingPlants)).toEqual(['Tepotzotlán']);
    }
    // Zonas y procesos no se filtran por planta (igual que antes).
    expect(
      names(byEmail(res.body, 'supervisor@hallazgos.test').zones),
    ).toHaveLength(2);
  });

  it('filtrar por zona o proceso deja en el usuario solo esa zona o proceso', async () => {
    const { zone, process } = e2e.base;

    const byZone = await e2e
      .call('get', `/users?zoneId=${zone.id}`, e2e.tokens.admin)
      .expect(200);
    expect(byZone.body.map((u: UserBody) => u.email)).toEqual([
      'supervisor@hallazgos.test',
    ]);
    expect(names(byZone.body[0].zones)).toEqual(['Pasillo norte']);

    const byProcess = await e2e
      .call('get', `/users?processId=${process.id}`, e2e.tokens.admin)
      .expect(200);
    expect(names(byProcess.body[0].processes)).toEqual(['Producción']);
  });

  it('el listado paginado (tabla de /users) solo trae plantas', async () => {
    const res = await e2e
      .call('get', '/users?page=1&limit=10', e2e.tokens.admin)
      .expect(200);

    expect(res.body.count).toBe(4);
    const supervisor = byEmail(res.body.data, 'supervisor@hallazgos.test');
    expect(names(supervisor.manufacturingPlants)).toEqual([
      'Manizales',
      'Tepotzotlán',
    ]);
    expect(supervisor).not.toHaveProperty('zones');
    expect(supervisor).not.toHaveProperty('processes');
  });

  it('editar un usuario carga sus zonas y procesos (findOne)', async () => {
    const res = await e2e
      .call('get', `/users/${e2e.base.users.supervisor.id}`, e2e.tokens.admin)
      .expect(200);

    expect(names(res.body.zones)).toHaveLength(2);
    expect(res.body.zones[0].manufacturingPlant).toEqual(
      expect.objectContaining({ name: expect.any(String) }),
    );
    expect(names(res.body.processes)).toHaveLength(2);
  });

  it('los supervisores traen solo las plantas del usuario en sesión', async () => {
    const res = await e2e
      .call('get', '/users/supervisors', e2e.tokens.general)
      .expect(200);

    const supervisor = byEmail(res.body, 'supervisor@hallazgos.test');
    expect(names(supervisor.manufacturingPlants)).toEqual(['Tepotzotlán']);
    expect(names(supervisor.zones)).toHaveLength(2);
  });

  describe('view=options (selectores)', () => {
    const emails = (body: UserBody[]) => body.map((u) => u.email);

    it('solo trae id, nombre, correo y rol, una vez por usuario y por nombre', async () => {
      // El supervisor tiene 2 plantas y 2 zonas: con el JOIN del filtro
      // podría repetirse.
      const res = await e2e
        .call('get', '/users?view=options', e2e.tokens.admin)
        .expect(200);

      expect(emails(res.body)).toHaveLength(4);
      expect(new Set(emails(res.body)).size).toBe(4);
      for (const user of res.body) {
        expect(Object.keys(user).sort()).toEqual([
          'email',
          'id',
          'name',
          'role',
        ]);
      }
      const userNames = names(res.body);
      expect(userNames).toEqual(
        [...userNames].sort((a, b) => a.localeCompare(b)),
      );
    });

    it('respeta la planta pedida y las plantas del usuario en sesión', async () => {
      const { manizales } = e2e.base.plants;

      const byPlant = await e2e
        .call(
          'get',
          `/users?view=options&manufacturingPlantId=${manizales.id}`,
          e2e.tokens.admin,
        )
        .expect(200);
      expect(emails(byPlant.body).sort()).toEqual([
        'admin@hallazgos.test',
        'general.co@hallazgos.test',
        'supervisor@hallazgos.test',
      ]);

      // General solo tiene Tepotzotlán: no ve a General Colombia.
      const mine = await e2e
        .call('get', '/users?view=options', e2e.tokens.general)
        .expect(200);
      expect(emails(mine.body)).not.toContain('general.co@hallazgos.test');
    });

    it('zoneIds deja a quienes tienen alguna de esas zonas, sin repetir', async () => {
      const { zone, zoneColombia, plants } = e2e.base;

      const res = await e2e
        .call(
          'get',
          `/users?view=options&manufacturingPlantId=${plants.tepotzotlan.id}&zoneIds=${zone.id},${zoneColombia.id}`,
          e2e.tokens.admin,
        )
        .expect(200);

      expect(emails(res.body)).toEqual(['supervisor@hallazgos.test']);
    });

    it.each([
      ['view desconocida', 'view=todo'],
      ['zoneIds no numéricos', 'zoneIds=1,abc'],
    ])('rechaza %s (400)', async (_c, query) => {
      await e2e.call('get', `/users?${query}`, e2e.tokens.admin).expect(400);
    });
  });

  describe('supervisores de una zona (formulario de nuevo hallazgo)', () => {
    it('trae solo los supervisores de la zona y planta, con id, nombre y correo', async () => {
      const { plants, zone } = e2e.base;
      const res = await e2e
        .call(
          'get',
          `/users/supervisors?manufacturingPlantId=${plants.tepotzotlan.id}&zoneId=${zone.id}`,
          e2e.tokens.general,
        )
        .expect(200);

      expect(res.body).toEqual([
        {
          id: e2e.base.users.supervisor.id,
          name: 'Supervisor Pruebas',
          email: 'supervisor@hallazgos.test',
        },
      ]);
    });

    it('una zona sin supervisores responde vacío', async () => {
      const { plants, zone } = e2e.base;
      const other = await e2e.dataSource.getRepository(Zone).save({
        name: 'Patio',
        manufacturingPlant: plants.tepotzotlan,
        createdBy: e2e.base.users.admin,
      });
      expect(zone.id).not.toBe(other.id);

      await e2e
        .call(
          'get',
          `/users/supervisors?manufacturingPlantId=${plants.tepotzotlan.id}&zoneId=${other.id}`,
          e2e.tokens.general,
        )
        .expect(200, []);
    });

    it('una planta que no es del usuario responde 404', async () => {
      const { plants, zoneColombia } = e2e.base;
      await e2e
        .call(
          'get',
          `/users/supervisors?manufacturingPlantId=${plants.manizales.id}&zoneId=${zoneColombia.id}`,
          e2e.tokens.general,
        )
        .expect(404);
    });

    it('sin filtros responde la lista completa, como antes', async () => {
      const res = await e2e
        .call('get', '/users/supervisors', e2e.tokens.general)
        .expect(200);

      const supervisor = byEmail(res.body, 'supervisor@hallazgos.test');
      expect(supervisor.zones).toBeDefined();
    });
  });

  // Al final: desactiva una planta.
  it('una planta inactiva no entra en la sesión ni en sus permisos', async () => {
    await e2e.dataSource
      .getRepository(ManufacturingPlant)
      .update(e2e.base.plants.manizales.id, { isActive: false });

    const me = await e2e
      .call('get', '/users/get-information-current-user', e2e.tokens.admin)
      .expect(200);
    expect(names(me.body.manufacturingPlants)).toEqual(['Tepotzotlán']);

    // El admin ya solo ve usuarios de Tepotzotlán.
    const list = await e2e.call('get', '/users', e2e.tokens.admin).expect(200);
    expect(list.body.map((u: UserBody) => u.email)).not.toContain(
      'general.co@hallazgos.test',
    );
    expect(
      names(
        byEmail(list.body, 'supervisor@hallazgos.test').manufacturingPlants,
      ),
    ).toEqual(['Tepotzotlán']);
  });
});
