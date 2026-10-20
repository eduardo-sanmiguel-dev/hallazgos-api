/**
 * Integración del dashboard contra la base de pruebas: el SQL de
 * dashboard.service se ejecuta de verdad (app completa, vía HTTP).
 *
 * Datos (planta 1 = Tepotzotlán, planta 2 = Manizales):
 * - Tepotzotlán: 2 abiertos, 1 en progreso, 1 cerrado y 1 cancelado.
 * - Manizales: 1 abierto (sirve para detectar fugas entre plantas).
 */
import * as argon2 from 'argon2';

import { MainType } from 'main-types/entities/main-type.entity';
import { User } from 'users/entities/user.entity';
import { createE2eApp, E2eApp } from './e2e-app';
import { saveEvidence, STATUSES, TEST_PASSWORD } from './fixtures';

const DAY = 24 * 60 * 60 * 1000;
const ddmmyyyy = (date: Date) =>
  [date.getDate(), date.getMonth() + 1, date.getFullYear()]
    .map((part, i) => String(part).padStart(i === 2 ? 4 : 2, '0'))
    .join('/');

describe('Integración: dashboard', () => {
  let e2e: E2eApp;
  const now = new Date();
  const range = {
    startDate: ddmmyyyy(new Date(now.getTime() - 60 * DAY)),
    endDate: ddmmyyyy(now),
  };

  beforeAll(async () => {
    e2e = await createE2eApp();
    const { dataSource, base } = e2e;
    const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * DAY);

    await saveEvidence(dataSource, base, { createdAt: at(0) });
    await saveEvidence(dataSource, base, {
      createdAt: at(40),
      priorityDays: 2,
    });
    await saveEvidence(dataSource, base, {
      status: STATUSES.inProgress,
      createdAt: at(0),
      startProcessDate: at(0),
    });
    await saveEvidence(dataSource, base, {
      status: STATUSES.closed,
      createdAt: at(3),
      solutionDate: at(1),
      priorityDays: 8,
    });
    await saveEvidence(dataSource, base, {
      status: STATUSES.cancelled,
      isActive: false,
      createdAt: at(0),
    });
    await saveEvidence(dataSource, base, {
      manufacturingPlant: base.plants.manizales,
      zone: base.zoneColombia,
      process: base.processColombia,
      user: base.users.generalColombia,
      supervisors: [],
      responsibles: [],
      createdAt: at(0),
    });
  });

  afterAll(() => e2e?.close());

  const get = (path: string, token = e2e.tokens.general) =>
    e2e.call('get', `/dashboard/${path}`, token).expect(200);
  const filters = (extra: Record<string, string> = {}) =>
    new URLSearchParams({
      manufacturingPlantId: '1',
      ...range,
      ...extra,
    }).toString();

  describe('valores', () => {
    it('global-summary cuenta los hallazgos de la planta por estado', async () => {
      const { body } = await get('global-summary?manufacturingPlantId=1');

      expect(body).toMatchObject({ planta: 'Tepotzotlán' });
      expect(Number(body.total)).toBe(5);
      expect(Number(body.abiertas)).toBe(2);
      expect(Number(body.cerradas)).toBe(1);
      expect(Number(body.canceladas)).toBe(1);
      expect(Number(body.pct_resolucion_historica)).toBe(20);
    });

    it('status-by-filters agrupa por estado en el rango', async () => {
      const { body } = await get(`status-by-filters?${filters()}`);

      expect(body.total).toBe(5);
      expect(body.seriesData).toEqual([
        { name: 'Abierto', y: 2 },
        { name: 'En progreso', y: 1 },
        { name: 'Cerrado', y: 1 },
        { name: 'Cancelado', y: 1 },
      ]);
    });

    it('status-by-filters por área y por responsable', async () => {
      const byArea = await get(
        `status-by-filters?${filters({ areaIds: String(e2e.base.area.id) })}`,
      );
      const byOtherArea = await get(
        `status-by-filters?${filters({ areaIds: '999' })}`,
      );
      const byResponsible = await get(
        `status-by-filters?${filters({ responsibleIds: String(e2e.base.users.general.id) })}`,
      );

      expect(byArea.body.total).toBe(5);
      expect(byOtherArea.body.total).toBe(0);
      expect(byResponsible.body.total).toBe(5);
    });

    it('status-by-filters con fechas inválidas responde 400', async () => {
      await e2e
        .call(
          'get',
          `/dashboard/status-by-filters?${filters({ startDate: '31/02/2026' })}`,
          e2e.tokens.general,
        )
        .expect(400);
      await e2e
        .call(
          'get',
          `/dashboard/status-by-filters?${filters({ startDate: range.endDate, endDate: range.startDate })}`,
          e2e.tokens.general,
        )
        .expect(400);
    });

    it('open-vs-closed solo considera las plantas del usuario y hallazgos activos', async () => {
      const { body } = await get('open-vs-closed');

      expect(body.categories).toEqual(['Tepotzotlán']);
      expect(body.series.map(({ data }) => data[0])).toEqual([2, 1]);
    });
  });

  describe('el SQL de cada endpoint corre sobre el esquema real', () => {
    const BY_PLANT = [
      'business-intelligence/epp',
      'critical-zones',
      'ranking-of-responsibles',
      'average-resolution-time',
      'monthly-type-trend',
      'monthly-subtype-trend',
      'main-types-global-trend',
    ];
    const BY_FILTERS = [
      'priority-intervention-by-filters',
      'risk-level-by-filters',
      'areas-by-filters',
      'main-types-by-filters',
      'heatmap-by-filters',
      'assigned-responsibles-by-filters',
      'sankey-by-filters',
      'packed-bubble-by-filters',
      'solid-gauge-kpi-by-filters',
      'area-range-line-by-filters',
    ];
    const GLOBAL = [
      'status',
      'historical-by-month',
      'zones',
      'main-types',
      'evidences-by-month',
      'accidents-by-month',
      'top-users-by-plant',
      'accidents-rate',
    ];

    it.each(BY_PLANT)('/%s', async (path) => {
      await get(`${path}?manufacturingPlantId=1`);
    });

    it.each(BY_FILTERS)('/%s (con todos los filtros)', async (path) => {
      await get(`${path}?${filters()}`);
      await get(
        `${path}?${filters({
          areaIds: String(e2e.base.area.id),
          responsibleIds: String(e2e.base.users.general.id),
          mainTypeIds: String(e2e.base.mainType.id),
        })}`,
      );
    });

    it('/responsibles-by-filters exige áreas (400 sin ellas)', async () => {
      await e2e
        .call(
          'get',
          `/dashboard/responsibles-by-filters?${filters()}`,
          e2e.tokens.general,
        )
        .expect(400, /areaIds es obligatorio/);
      await get(
        `responsibles-by-filters?${filters({
          areaIds: String(e2e.base.area.id),
          mainTypeIds: String(e2e.base.mainType.id),
        })}`,
      );
    });

    it.each([...BY_FILTERS, 'status-by-filters', 'responsibles-by-filters'])(
      '/%s sin fechas responde 400',
      async (path) => {
        await e2e
          .call(
            'get',
            `/dashboard/${path}?manufacturingPlantId=1`,
            e2e.tokens.general,
          )
          .expect(400);
      },
    );

    it.each(BY_FILTERS)(
      '/%s: un supervisor sin responsables usa los hallazgos que supervisa',
      async (path) => {
        await get(
          `${path}?${filters({ responsibleIds: String(e2e.base.users.supervisor.id) })}`,
        );
      },
    );

    it.each(GLOBAL)('/%s', async (path) => {
      await get(path);
    });

    it.each([
      'main-types-global-trend-details',
      'percentage-compliance-by-zone',
    ])('/%s', async (path) => {
      await get(
        `${path}?manufacturingPlantId=1&mainTypeId=${e2e.base.mainType.id}`,
      );
    });
  });

  // Endpoints sin planta: no deben devolver datos de plantas ajenas al usuario
  // (historical-by-month los devolvía; corregido).
  describe('fugas entre plantas (usuario de Tepotzotlán)', () => {
    it('/historical-by-month: el administrador ve sus dos plantas', async () => {
      const { body } = await get('historical-by-month', e2e.tokens.admin);

      expect(body.series.map(({ name }) => name).sort()).toEqual([
        'Manizales',
        'Tepotzotlán',
      ]);
    });

    it.each([
      'status',
      'historical-by-month',
      'zones',
      'main-types',
      'evidences-by-month',
      'top-users-by-plant',
    ])('/%s no incluye datos de Manizales', async (path) => {
      const { body } = await get(path);

      expect(JSON.stringify(body)).not.toMatch(
        /Manizales|Bodega|General Colombia/,
      );
    });
  });

  // Regla escrita en el código: para glora@hadainternational.com el dashboard
  // excluye "Comportamiento inseguro" y "Condición insegura".
  describe('usuario con tipos restringidos', () => {
    let token: string;

    beforeAll(async () => {
      await e2e.dataSource
        .getRepository(MainType)
        .save({ name: 'Acto seguro' });
      await e2e.dataSource.getRepository(User).save({
        name: 'Usuario restringido',
        email: 'glora@hadainternational.com',
        password: await argon2.hash(TEST_PASSWORD),
        role: 'Administrador',
        manufacturingPlants: [e2e.base.plants.tepotzotlan],
      });
      token = await e2e.login('glora@hadainternational.com');
    });

    it('status-by-filters no cuenta "Condición insegura"', async () => {
      const { body } = await get(`status-by-filters?${filters()}`, token);

      expect(body.total).toBe(0);
    });

    it('pidiendo solo un tipo excluido tampoco cuenta nada', async () => {
      const { body } = await get(
        `status-by-filters?${filters({ mainTypeIds: String(e2e.base.mainType.id) })}`,
        token,
      );

      expect(body.total).toBe(0);
    });

    it.each([
      'main-types-by-filters',
      'areas-by-filters',
      'heatmap-by-filters',
    ])('/%s corre con la restricción', async (path) => {
      await get(`${path}?${filters()}`, token);
    });
  });
});
