import {
  buildAdmin,
  buildManufacturingPlant,
  buildSupervisor,
  buildUser,
  createHttpTestApp,
  type HttpTestApp,
  mockProvider,
} from '../../test/utils/index.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

/** Endpoints que solo reciben la planta (validada con UserPlantPipe). */
const BY_PLANT: [string, keyof DashboardService][] = [
  ['critical-zones', 'findCriticalZones'],
  ['global-summary', 'findGlobalSummary'],
  ['ranking-of-responsibles', 'findRankingOfResponsibles'],
  ['average-resolution-time', 'findAverageResolutionTime'],
  ['monthly-type-trend', 'findMonthlyTypeTrend'],
  ['monthly-subtype-trend', 'findMonthlySubtypeTrend'],
  ['main-types-global-trend', 'findMainTypesGlobalTrend'],
];

/** Endpoints con filtros de fecha, áreas, responsables y tipos. */
const BY_FILTERS: [string, keyof DashboardService][] = [
  ['status-by-filters', 'findStatusByFilters'],
  ['priority-intervention-by-filters', 'findPriorityInterventionByFilters'],
  ['risk-level-by-filters', 'findRiskLevelByFilters'],
  ['areas-by-filters', 'findAreasByFilters'],
  ['main-types-by-filters', 'findMainTypesByFilters'],
  ['heatmap-by-filters', 'findHeatmapByFilters'],
  ['assigned-responsibles-by-filters', 'findAssignedResponsiblesByFilters'],
  ['sankey-by-filters', 'findSankeyByFilters'],
  ['packed-bubble-by-filters', 'findPackedBubbleByFilters'],
  ['solid-gauge-kpi-by-filters', 'findSolidGaugeKpiByFilters'],
  ['area-range-line-by-filters', 'findAreaRangeLineByFilters'],
];

/** Endpoints sin planta (datos globales). */
const GLOBAL: [string, keyof DashboardService][] = [
  ['status', 'findAllStatus'],
  ['historical-by-month', 'findHistoricalByMonth'],
  ['zones', 'findAllZones'],
  ['main-types', 'findAllMainTypes'],
  ['top-users-by-plant', 'findTopUsersByPlant'],
  ['open-vs-closed', 'findOpenVsClosed'],
  ['accidents-rate', 'findAccidentsRate'],
];

describe('DashboardController (HTTP)', () => {
  let http: HttpTestApp;
  let service: Record<string, jest.Mock>;

  beforeAll(async () => {
    http = await createHttpTestApp({
      controllers: [DashboardController],
      providers: [mockProvider(DashboardService)],
      user: buildUser({
        manufacturingPlants: [buildManufacturingPlant({ id: 1 })],
      }),
    });
    service = http.get(DashboardService) as unknown as Record<
      string,
      jest.Mock
    >;
  });

  afterAll(() => http.close());

  beforeEach(() => {
    jest.clearAllMocks();
    for (const fn of Object.values(service)) fn.mockResolvedValue([]);
  });

  const get = (route: string, query: object = {}) =>
    http.http().get(`/dashboard/${route}`).query(query);

  describe('/business-intelligence/epp (solo administradores)', () => {
    const route = 'business-intelligence/epp';
    const plants = [buildManufacturingPlant({ id: 1 })];

    afterEach(() => http.setUser(buildUser({ manufacturingPlants: plants })));

    it.each([
      ['General', buildUser({ manufacturingPlants: plants })],
      ['Supervisor', buildSupervisor({ manufacturingPlants: plants })],
    ])('un usuario %s recibe 403 y no se consulta', async (_, user) => {
      http.setUser(user);
      await get(route, { manufacturingPlantId: '1' }).expect(403);

      expect(service.findBusinessIntelligenceEpp).not.toHaveBeenCalled();
    });

    it('un administrador con una planta propia obtiene los datos', async () => {
      http.setUser(buildAdmin({ manufacturingPlants: plants }));
      await get(route, { manufacturingPlantId: '1' }).expect(200);

      expect(service.findBusinessIntelligenceEpp).toHaveBeenCalledWith(
        1,
        undefined,
        undefined,
      );
    });

    it('pasa el periodo elegido al servicio', async () => {
      http.setUser(buildAdmin({ manufacturingPlants: plants }));
      await get(route, {
        manufacturingPlantId: '1',
        startDate: '01/09/2026',
        endDate: '30/09/2026',
      }).expect(200);

      expect(service.findBusinessIntelligenceEpp).toHaveBeenCalledWith(
        1,
        '01/09/2026',
        '30/09/2026',
      );
    });

    it.each([
      ['out-of-range', 'findBusinessIntelligenceEppOutOfRange'],
      ['employees/5', 'findBusinessIntelligenceEppEmployee'],
    ])(
      '/%s: General recibe 403 y administrador consulta',
      async (path, method) => {
        http.setUser(buildUser({ manufacturingPlants: plants }));
        await get(`${route}/${path}`, { manufacturingPlantId: '1' }).expect(
          403,
        );
        expect(service[method]).not.toHaveBeenCalled();

        http.setUser(buildAdmin({ manufacturingPlants: plants }));
        await get(`${route}/${path}`, {
          manufacturingPlantId: '1',
          startDate: '01/10/2026',
          endDate: '22/10/2026',
        }).expect(200);
        expect(service[method]).toHaveBeenCalledWith(
          1,
          ...(path.startsWith('employees') ? [5] : []),
          '01/10/2026',
          '22/10/2026',
        );
      },
    );

    it('el detalle de colaborador exige un id numérico', async () => {
      http.setUser(buildAdmin({ manufacturingPlants: plants }));
      await get(`${route}/employees/abc`, { manufacturingPlantId: '1' }).expect(
        400,
      );
      expect(
        service.findBusinessIntelligenceEppEmployee,
      ).not.toHaveBeenCalled();
    });

    it('un administrador con una planta ajena recibe 404 y sin planta 400', async () => {
      http.setUser(buildAdmin({ manufacturingPlants: plants }));
      await get(route, { manufacturingPlantId: '2' }).expect(404);
      await get(route).expect(400);

      expect(service.findBusinessIntelligenceEpp).not.toHaveBeenCalled();
    });
  });

  describe.each([...BY_PLANT, ...BY_FILTERS])('/%s', (route, method) => {
    it('con una planta propia llama al servicio con el id numérico', async () => {
      await get(route, { manufacturingPlantId: '1' }).expect(200);

      expect(service[method].mock.calls[0][0]).toBe(1);
    });

    it('con una planta ajena responde 404 y sin planta 400', async () => {
      await get(route, { manufacturingPlantId: '2' }).expect(404);
      await get(route).expect(400);

      expect(service[method]).not.toHaveBeenCalled();
    });
  });

  it.each(BY_FILTERS)(
    '/%s convierte las listas de ids y descarta valores inválidos',
    async (route, method) => {
      await get(route, {
        manufacturingPlantId: '1',
        startDate: '01/10/2026',
        endDate: '31/10/2026',
        areaIds: '3,abc,3,0',
        responsibleId: '7',
        mainTypeIds: '2, 4',
      }).expect(200);

      expect(service[method]).toHaveBeenCalledWith(
        1,
        '01/10/2026',
        '31/10/2026',
        [3],
        [7],
        [2, 4],
      );
    },
  );

  it('responsibles-by-filters no recibe responsables', async () => {
    await get('responsibles-by-filters', {
      manufacturingPlantId: '1',
      areaId: '3',
      mainTypeId: '2',
    }).expect(200);

    expect(service.findResponsiblesByFilters).toHaveBeenCalledWith(
      1,
      undefined,
      undefined,
      [3],
      [2],
    );
  });

  it.each([
    ['main-types-global-trend-details', 'findMainTypesGlobalTrendDetails'],
    ['percentage-compliance-by-zone', 'findPercentageComplianceByZone'],
  ])('/%s recibe planta y tipo principal numéricos', async (route, method) => {
    await get(route, { manufacturingPlantId: '1', mainTypeId: '5' }).expect(
      200,
    );

    expect(service[method].mock.calls[0].slice(0, 2)).toEqual([1, 5]);
  });

  it.each(GLOBAL)('/%s no exige planta', async (route, method) => {
    await get(route).expect(200);

    expect(service[method]).toHaveBeenCalled();
  });

  it.each([
    ['evidences-by-month', 'findAllEvidencesByMonth'],
    ['accidents-by-month', 'findAllAccidentsByMonth'],
  ])('/%s: año opcional y entero', async (route, method) => {
    await get(route).expect(200);
    await get(route, { year: '2026' }).expect(200);
    await get(route, { year: '2026)--' }).expect(400);

    expect(service[method].mock.calls).toEqual([[undefined], [2026]]);
  });
});
