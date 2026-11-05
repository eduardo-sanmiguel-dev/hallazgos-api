import { createE2eApp, type E2eApp } from './e2e-app.js';
import { User } from '../../src/users/entities/user.entity.js';
import { ManufacturingPlant } from '../../src/manufacturing-plants/entities/manufacturing-plant.entity.js';
import { MainType } from '../../src/main-types/entities/main-type.entity.js';
import { SecondaryType } from '../../src/secondary-types/entities/secondary-type.entity.js';
import { Area } from '../../src/areas/entities/area.entity.js';
import { Zone } from '../../src/zones/entities/zone.entity.js';
import { Processes } from '../../src/processes/entities/processes.entity.js';
import { Employee } from '../../src/employees/entities/employee.entity.js';
import { Equipment } from '../../src/equipments/entities/equipment.entity.js';
import { EmergencyTeam } from '../../src/emergency-teams/entities/emergency-team.entity.js';
import { GembaWalkZone } from '../../src/gemba-walk-zones/entities/gemba-walk-zone.entity.js';
import { GembaWalkObserver } from '../../src/gemba-walk-observers/entities/gemba-walk-observer.entity.js';
import { GembaWalkCalendar } from '../../src/gemba-walk-calendar/entities/gemba-walk-calendar.entity.js';
import { GembaWalkEvaluation } from '../../src/gemba-walk-evaluations/entities/gemba-walk-evaluation.entity.js';
import type { ObjectLiteral } from 'typeorm';

const catalogs = {
  users: User,
  employees: Employee,
  'manufacturing-plants': ManufacturingPlant,
  areas: Area,
  zones: Zone,
  processes: Processes,
  'main-types': MainType,
  'secondary-types': SecondaryType,
  equipments: Equipment,
  'emergency-teams': EmergencyTeam,
  'gemba-walk-zones': GembaWalkZone,
  'gemba-walk-observers': GembaWalkObserver,
  'gemba-walk-calendar': GembaWalkCalendar,
  'gemba-walk-evaluations': GembaWalkEvaluation,
};
const route = (key: string) => '/' + key.replace('gemba-walk-', 'gemba-walk/');

describe('Tablas administrativas y reactivación con PostgreSQL real', () => {
  let app: E2eApp;
  const ids: Record<string, number> = {};
  beforeAll(async () => {
    app = await createE2eApp();
    const plant = app.base.plants.tepotzotlan;
    const common = {
      isActive: false,
      manufacturingPlant: plant,
      createdBy: app.base.users.admin,
    };
    const db = app.dataSource;
    const gembaZone = await db.getRepository(GembaWalkZone).save({
      nameZone: 'Padre activo',
      nameLocation: 'Lugar',
      manufacturingPlant: plant,
    });
    const rows: Record<string, ObjectLiteral> = {
      users: {
        name: 'Usuario inactivo',
        email: 'inactive@hallazgos.test',
        password: 'Password1',
        role: 'General',
        manufacturingPlants: [plant],
      },
      employees: {
        name: 'Empleado inactivo',
        code: 9933,
        manufacturingPlants: [plant],
      },
      'manufacturing-plants': {
        name: 'Planta inactiva',
        link: 'https://test.com',
        lat: 1,
        lng: 1,
      },
      areas: { name: 'Zona inactiva' },
      zones: { name: 'Lugar inactivo', area: app.base.area },
      processes: { name: 'Proceso inactivo' },
      'main-types': { name: 'Criterio inactivo' },
      'secondary-types': {
        name: 'Tipo inactivo',
        mainType: app.base.mainType,
        typeResponsible: 'Seguridad',
      },
      equipments: { name: 'Equipo inactivo' },
      'emergency-teams': {
        location: 'Almacén',
        extinguisherNumber: 'E-9933',
        typeOfExtinguisher: 'PQS',
        capacity: 5,
      },
      'gemba-walk-zones': {
        nameZone: 'Zona inactiva',
        nameLocation: 'Lugar inactivo',
      },
      'gemba-walk-observers': {
        gembaWalkZone: gembaZone,
        user: app.base.users.general,
      },
      'gemba-walk-calendar': {
        gembaWalkZone: gembaZone,
        scheduledAt: new Date(Date.now() + 86400000),
      },
      'gemba-walk-evaluations': {
        area: 'EPP',
        category: 'SHE',
        description: 'Concepto inactivo',
      },
    };
    for (const [key, entity] of Object.entries(catalogs)) {
      const row = await db
        .getRepository<ObjectLiteral>(entity)
        .save({ ...common, ...rows[key] });
      ids[key] = row.id;
    }
  });
  afterAll(async () => {
    await app?.close();
  });
  it.each(Object.keys(catalogs))(
    '%s: tabla incluye inactivos, captura los excluye y reactivar los recupera',
    async (key) => {
      const path = route(key);
      const get = (extra = '') =>
        app
          .call('get', path + '?page=1&limit=-1' + extra, app.tokens.admin)
          .expect(200);
      expect((await get()).body.data.map((r) => r.id)).not.toContain(ids[key]);
      const inactive = (await get('&includeInactive=true')).body.data.find(
        (r) => r.id === ids[key],
      );
      expect(inactive?.isActive).toBe(false);
      const deleted = await app.call(
        'delete',
        `${path}/${ids[key]}`,
        app.tokens.admin,
      );
      expect([400, 404]).toContain(deleted.status);
      await app
        .call('get', path + '?includeInactive=true', app.tokens.general)
        .expect(403);
      await app
        .call(
          'patch',
          `/catalogs/${key}/${ids[key]}/activate`,
          app.tokens.general,
        )
        .expect(403);
      await app
        .call(
          'patch',
          `/catalogs/${key}/${ids[key]}/activate`,
          app.tokens.admin,
        )
        .expect(200);
      expect((await get()).body.data.map((r) => r.id)).toContain(ids[key]);
      // A second activation is idempotent.
      await app
        .call(
          'patch',
          `/catalogs/${key}/${ids[key]}/activate`,
          app.tokens.admin,
        )
        .expect(200);
    },
  );
  it('no reactiva un tipo con criterio padre inactivo', async () => {
    const db = app.dataSource;
    await db
      .getRepository(MainType)
      .update(app.base.mainType.id, { isActive: false });
    await db
      .getRepository(SecondaryType)
      .update(ids['secondary-types'], { isActive: false });
    await app
      .call(
        'patch',
        `/catalogs/secondary-types/${ids['secondary-types']}/activate`,
        app.tokens.admin,
      )
      .expect(400);
    await db
      .getRepository(MainType)
      .update(app.base.mainType.id, { isActive: true });
  });
  it('rechaza eventos pasados y duplicados activos', async () => {
    await app.dataSource
      .getRepository(GembaWalkCalendar)
      .update(ids['gemba-walk-calendar'], {
        isActive: false,
        scheduledAt: new Date(0),
      });
    await app
      .call(
        'patch',
        `/catalogs/gemba-walk-calendar/${ids['gemba-walk-calendar']}/activate`,
        app.tokens.admin,
      )
      .expect(400);
    const row = await app.dataSource
      .getRepository(Area)
      .findOneByOrFail({ id: ids.areas });
    await app.dataSource
      .getRepository(Area)
      .update(row.id, { isActive: false });
    await app.dataSource.getRepository(Area).save({
      name: row.name.toUpperCase(),
      manufacturingPlant: app.base.plants.tepotzotlan,
    });
    await app
      .call('patch', `/catalogs/areas/${row.id}/activate`, app.tokens.admin)
      .expect(409);
  });
  it('no permite usar la ruta para una entidad arbitraria', async () => {
    await app
      .call('patch', '/catalogs/evidences/1/activate', app.tokens.admin)
      .expect(404);
  });
});
