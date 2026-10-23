import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  buildUser,
  createRepositoryMock,
  type RepositoryMock,
  runAsUser,
} from '../../test/utils/index.js';
import { RequestContextService } from '../shared/services/request-context.service.js';
import { ManufacturingPlant } from '../manufacturing-plants/entities/manufacturing-plant.entity.js';
import { Evidence } from '../evidences/entities/evidence.entity.js';
import { MainType } from '../main-types/entities/main-type.entity.js';
import { AccidentRate } from './entities/accident-rate.entity.js';
import { DashboardService } from './dashboard.service.js';

// El SQL se verifica contra PostgreSQL en test/db/dashboard.int-spec.ts.
// Aquí se comprueban validaciones, alcance de los filtros y transformaciones.
describe('DashboardService: reglas y resultados de reportes', () => {
  let service: DashboardService,
    plants: RepositoryMock<ManufacturingPlant>,
    evidence: RepositoryMock<Evidence>,
    types: RepositoryMock<MainType>;
  let query: jest.Mock;
  const user = buildUser({
    id: 10,
    manufacturingPlants: [{ id: 1 }, { id: 2 }] as never,
  });
  const as = <T>(fn: () => Promise<T>, session = user) =>
    runAsUser(session, fn);
  const start = '01/01/2026',
    end = '30/04/2026';
  const qb = () => evidence.queryBuilder;
  beforeEach(() => {
    plants = createRepositoryMock<ManufacturingPlant>();
    evidence = createRepositoryMock<Evidence>();
    types = createRepositoryMock<MainType>();
    query = jest.fn().mockResolvedValue([]);
    Object.assign(plants, { manager: { query } });
    qb().getRawMany.mockResolvedValue([]);
    qb().getRawOne.mockResolvedValue(null);
    service = new DashboardService(
      plants,
      createRepositoryMock<AccidentRate>(),
      evidence,
      types,
      new RequestContextService(),
    );
  });
  const cases = [
    {
      method: 'findStatusByFilters',
      rows: [
        { status: 'Abierto', total: '3' },
        { status: 'Cerrado', total: '2' },
      ],
      total: 5,
    },
    {
      method: 'findPriorityInterventionByFilters',
      rows: [
        { priorityDays: '2', total: '3' },
        { priorityDays: '15', total: '2' },
        { priorityDays: 'invalid', total: '99' },
      ],
      total: 5,
    },
    {
      method: 'findRiskLevelByFilters',
      rows: [
        { riskLevel: 'Alto', total: '3' },
        { riskLevel: 'Bajo', total: '2' },
        { riskLevel: null, total: '99' },
      ],
      total: 5,
    },
    {
      method: 'findAreasByFilters',
      rows: [
        { name: 'Almacén', total: '2' },
        { name: 'Producción', total: '3' },
      ],
      total: 5,
    },
    {
      method: 'findMainTypesByFilters',
      rows: [
        { name: 'Condición', total: '2' },
        { name: 'Acto', total: '3' },
      ],
      total: 5,
    },
    {
      method: 'findAssignedResponsiblesByFilters',
      rows: [
        {
          responsibleId: '11',
          responsibleName: 'Zoe',
          status: 'Abierto',
          total: '3',
        },
        {
          responsibleId: '12',
          responsibleName: 'Ana',
          status: 'Cerrado',
          total: '2',
        },
      ],
      total: 5,
    },
    {
      method: 'findSankeyByFilters',
      rows: [
        { areaName: 'Almacén', status: 'Abierto', total: '2' },
        { areaName: 'Producción', status: 'Cerrado', total: '3' },
        { areaName: 'Vacía', status: 'Cancelado', total: '0' },
      ],
      total: 5,
    },
    {
      method: 'findPackedBubbleByFilters',
      rows: [
        { areaName: 'Almacén', status: 'Abierto', total: '2' },
        { areaName: 'Producción', status: 'Abierto', total: '3' },
        { areaName: 'Vacía', status: 'Cerrado', total: '0' },
      ],
      total: 5,
    },
  ] as const;
  type FilterMethod =
    | (typeof cases)[number]['method']
    | 'findHeatmapByFilters'
    | 'findSolidGaugeKpiByFilters'
    | 'findAreaRangeLineByFilters';
  const invoke = <M extends FilterMethod>(
    method: M,
    plant = 1,
    from = start,
    to = end,
    areas?: number[],
    responsibles?: number[],
    mainTypes?: number[],
  ) =>
    as(
      async () =>
        (await service[method](
          plant,
          from,
          to,
          areas,
          responsibles,
          mainTypes,
        )) as Awaited<ReturnType<DashboardService[M]>>,
    );
  describe.each(cases)('$method', ({ method, rows, total }) => {
    it('convierte conteos y conserva filtros de planta, fechas, área y tipo', async () => {
      qb()
        .getRawMany.mockResolvedValueOnce([...rows])
        .mockResolvedValue([]);
      const result = await invoke(method, 1, start, end, [4], undefined, [8]);
      expect(result.total).toBe(total);
      expect(result).toMatchObject({ startDate: start, endDate: end });
      expect(qb().where).toHaveBeenCalledWith(
        'evidence."manufacturingPlantId" = :manufacturingPlantId',
        { manufacturingPlantId: 1 },
      );
      expect(qb().andWhere).toHaveBeenCalledWith(
        'zone."areaId" IN (:...areaIds)',
        { areaIds: [4] },
      );
      expect(qb().andWhere).toHaveBeenCalledWith(
        'evidence."mainTypeId" IN (:...mainTypeIds)',
        { mainTypeIds: [8] },
      );
      const dateArgs = qb().andWhere.mock.calls.find(
        ([, params]) => params?.startDate,
      )?.[1] as { startDate: Date; endDate: Date };
      expect([
        dateArgs.startDate.getHours(),
        dateArgs.endDate.getHours(),
        dateArgs.endDate.getMilliseconds(),
      ]).toEqual([0, 23, 999]);
    });
    it('devuelve cero cuando no hay datos y no agrega filtros vacíos', async () => {
      const result = await invoke(method, 1, start, end, [], [], []);
      expect(result.total).toBe(0);
      expect(qb().andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining(':...areaIds'),
        expect.anything(),
      );
      expect(qb().andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining(':...mainTypeIds'),
        expect.anything(),
      );
    });
    it('consulta responsables cuando tienen datos sin recurrir a supervisores', async () => {
      qb().getRawMany.mockResolvedValue([...rows]);
      qb().getRawOne.mockResolvedValue({ total: '2' });
      const result = await invoke(method, 1, start, end, [4], [11], [8]);
      expect(result.total).toBe(total);
      expect(qb().innerJoin).toHaveBeenCalledWith(
        'evidence_responsibles_user',
        'eru',
        expect.any(String),
      );
      expect(qb().innerJoin).not.toHaveBeenCalledWith(
        'evidence_supervisors_user',
        'esu',
        expect.any(String),
      );
    });
    it('recurre a supervisores cuando no hay resultados de responsables', async () => {
      qb()
        .getRawMany.mockResolvedValueOnce([])
        .mockResolvedValue([...rows]);
      qb().getRawOne.mockResolvedValue(null);
      const result = await invoke(method, 1, start, end, [4], [11], [8]);
      expect(result.total).toBe(total);
      expect(qb().innerJoin).toHaveBeenCalledWith(
        'evidence_supervisors_user',
        'esu',
        expect.any(String),
      );
      expect(qb().andWhere).toHaveBeenCalledWith(
        'esu."userId" IN (:...responsibleIds)',
        { responsibleIds: [11] },
      );
    });
    it('propaga errores de almacenamiento sin convertirlos en reportes vacíos', async () => {
      qb().getRawMany.mockRejectedValue(Error('database unavailable'));
      await expect(invoke(method)).rejects.toThrow('database unavailable');
    });
  });
  const filterMethods: FilterMethod[] = [
    ...cases.map((c) => c.method),
    'findHeatmapByFilters',
    'findSolidGaugeKpiByFilters',
    'findAreaRangeLineByFilters',
  ];
  describe.each(filterMethods)('validación de %s', (method) => {
    it.each([
      [0, start, end, 'manufacturingPlantId'],
      [1, '', end, 'obligatorias'],
      [1, start, '', 'obligatorias'],
      [1, '31/02/2026', end, 'formato'],
      [1, '2026-01-01', end, 'formato'],
      [1, '01/01/2026/extra', end, 'formato'],
      [1, '00/01/2026', end, 'formato'],
      [1, '01/00/2026', end, 'formato'],
      [1, '01/01/0000', end, 'formato'],
      [1, '01/05/2026', end, 'mayor'],
      [1, start, '31/04/2026', 'formato'],
    ])(
      'rechaza planta/fechas inválidas sin consultar datos (%s, %s, %s)',
      async (plant, from, to, message) => {
        await expect(
          invoke(method, Number(plant), String(from), String(to)),
        ).rejects.toThrow(String(message));
        expect(evidence.createQueryBuilder).not.toHaveBeenCalled();
      },
    );
  });
  it('acepta un 29 de febrero real y rechaza parámetros de fecha repetidos', async () => {
    await expect(
      invoke('findStatusByFilters', 1, '29/02/2024', '29/02/2024'),
    ).resolves.toMatchObject({ total: 0 });
    await expect(
      invoke(
        'findStatusByFilters',
        1,
        ['01/01/2026', '02/01/2026'] as never,
        end,
      ),
    ).rejects.toThrow(BadRequestException);
  });
  describe('restricción de tipos del usuario', () => {
    const restricted = buildUser({
      ...user,
      email: ' GLÓRA@HADAINTERNATIONAL.COM ',
    });
    const call = (ids?: number[]) =>
      as(
        () =>
          service.findStatusByFilters(1, start, end, undefined, undefined, ids),
        restricted,
      );
    beforeEach(() =>
      types.find.mockResolvedValue([
        { id: 1, name: 'Condición insegura' },
        { id: 2, name: 'Comportamiento inseguro' },
        { id: 3, name: 'Acto seguro' },
      ] as MainType[]),
    );
    it('normaliza correo y nombres acentuados y solo permite tipos autorizados', async () => {
      await call();
      expect(qb().andWhere).toHaveBeenCalledWith(
        'evidence."mainTypeId" IN (:...mainTypeIds)',
        { mainTypeIds: [3] },
      );
    });
    it('intersecta, elimina duplicados e ignora identificadores inválidos', async () => {
      await call([1, 3, 3, 0, -1, 1.5, NaN]);
      expect(qb().andWhere).toHaveBeenCalledWith(
        'evidence."mainTypeId" IN (:...mainTypeIds)',
        { mainTypeIds: [3] },
      );
    });
    it.each([{ ids: [] }, { ids: [1] }])(
      'no amplía el alcance si no queda ningún tipo permitido: %p',
      async ({ ids }) => {
        types.find.mockResolvedValue([
          { id: 1, name: 'Condición insegura' },
        ] as MainType[]);
        await call(ids);
        expect(qb().andWhere).toHaveBeenCalledWith(
          'evidence."mainTypeId" IN (:...mainTypeIds)',
          { mainTypeIds: [-1] },
        );
      },
    );
    it('rechaza la selección de solo tipos excluidos aunque existan otros activos', async () => {
      await call([1, 2]);
      expect(qb().andWhere).toHaveBeenCalledWith(
        'evidence."mainTypeId" IN (:...mainTypeIds)',
        { mainTypeIds: [-1] },
      );
    });
    it('no limita tipos para otros usuarios, pero limpia ids inválidos', async () => {
      await invoke(
        'findStatusByFilters',
        1,
        start,
        end,
        undefined,
        undefined,
        [8, 8, -1, 0, 1.5],
      );
      expect(types.find).not.toHaveBeenCalled();
      expect(qb().andWhere).toHaveBeenCalledWith(
        'evidence."mainTypeId" IN (:...mainTypeIds)',
        { mainTypeIds: [8] },
      );
    });
  });
  it.each(['findAreasByFilters', 'findMainTypesByFilters'] as const)(
    '%s ordena por cantidad descendente',
    async (method) => {
      qb().getRawMany.mockResolvedValue([
        { name: 'Menor', total: '2' },
        { name: 'Mayor', total: '9' },
      ]);
      const result = await invoke(method);
      expect(result.seriesData).toEqual([
        { name: 'Mayor', y: 9 },
        { name: 'Menor', y: 2 },
      ]);
      expect(result.total).toBe(11);
    },
  );
  it('conserva estados ausentes en cero y un orden estable', async () => {
    qb().getRawMany.mockResolvedValue([{ status: 'Cerrado', total: '2' }]);
    const result = await invoke('findStatusByFilters');
    expect(result.seriesData).toEqual([
      { name: 'Abierto', y: 0 },
      { name: 'En progreso', y: 0 },
      { name: 'Cerrado', y: 2 },
      { name: 'Cancelado', y: 0 },
    ]);
  });
  it('separa hallazgos sin prioridad de los clasificados', async () => {
    qb().getRawMany.mockResolvedValue([{ priorityDays: '15', total: '4' }]);
    qb().getRawOne.mockResolvedValue({ total: '3' });
    const result = await invoke('findPriorityInterventionByFilters');
    expect(result).toMatchObject({
      total: 4,
      totalWithPriority: 4,
      totalWithoutPriority: 3,
    });
    expect(result.seriesData.find((p) => p.days === 15)?.y).toBe(4);
  });
  it('ordena responsables por nombre e id y acumula sus estados', async () => {
    qb()
      .getRawMany.mockResolvedValueOnce([
        {
          responsibleId: '3',
          responsibleName: 'Ana',
          status: 'Abierto',
          total: '2',
        },
        {
          responsibleId: '2',
          responsibleName: 'Ana',
          status: 'Cerrado',
          total: '1',
        },
        {
          responsibleId: '3',
          responsibleName: 'Ana',
          status: 'Abierto',
          total: '4',
        },
      ])
      .mockResolvedValue([]);
    const result = await invoke('findAssignedResponsiblesByFilters');
    expect(result).toMatchObject({
      categories: ['Ana', 'Ana'],
      total: 7,
      series: [
        { name: 'Abierto', data: [0, 6] },
        { name: 'Cerrado', data: [1, 0] },
      ],
    });
    expect(qb().andWhere).toHaveBeenCalledWith(
      expect.stringContaining('NOT EXISTS'),
    );
  });
  it('Sankey omite enlaces vacíos y nodos desconectados y ordena pesos', async () => {
    qb().getRawMany.mockResolvedValue([...cases[6].rows]);
    const result = await invoke('findSankeyByFilters');
    expect(result.links.map((x) => x.weight)).toEqual([3, 2]);
    expect(result.nodes.map((n) => n.name)).toEqual([
      'Producción',
      'Almacén',
      'Abierto',
      'Cerrado',
    ]);
  });
  it('las burbujas omiten ceros y estados sin datos', async () => {
    qb().getRawMany.mockResolvedValue([...cases[7].rows]);
    const result = await invoke('findPackedBubbleByFilters');
    expect(result.series).toEqual([
      {
        name: 'Abierto',
        data: [
          { name: 'Producción', value: 3 },
          { name: 'Almacén', value: 2 },
        ],
      },
    ]);
  });
  describe('KPI de cierre', () => {
    it('calcula porcentajes y redondea los días sin perder el backlog', async () => {
      qb().getRawOne.mockResolvedValue({
        total: '6',
        closed: '2',
        backlogActive: '3',
        avgResolutionDays: '1.236',
      });
      expect(
        await invoke(
          'findSolidGaugeKpiByFilters',
          1,
          start,
          end,
          [4],
          [11],
          [8],
        ),
      ).toMatchObject({
        total: 6,
        closurePercentage: 33.33,
        avgResolutionDays: 1.24,
        backlogActive: 3,
      });
    });
    it('evita divisiones entre cero cuando no hay hallazgos', async () =>
      expect(await invoke('findSolidGaugeKpiByFilters')).toMatchObject({
        total: 0,
        closurePercentage: 0,
        avgResolutionDays: 0,
        backlogActive: 0,
      }));
    it('usa supervisores si el responsable no tiene hallazgos', async () => {
      qb()
        .getRawOne.mockResolvedValueOnce({ total: '0' })
        .mockResolvedValueOnce({ total: '4', closed: '3' });
      expect(
        await invoke('findSolidGaugeKpiByFilters', 1, start, end, [], [11]),
      ).toMatchObject({ total: 4, closurePercentage: 75 });
      expect(qb().innerJoin).toHaveBeenCalledWith(
        'evidence_supervisors_user',
        'esu',
        expect.any(String),
      );
    });
  });
  describe('mapa de calor', () => {
    const points = [
      {
        areaId: '1',
        areaName: 'A',
        x: '10',
        y: '20',
        zoomLevel: '2',
        total: '4',
        openCount: '2',
        inProgressCount: '2',
        closedCount: '0',
        cancelledCount: '0',
      },
      {
        areaId: '2',
        areaName: 'B',
        x: '30',
        y: '40',
        zoomLevel: null,
        total: '3',
        closedCount: '3',
      },
      { areaId: '3', areaName: 'Vacía', x: '1', y: '1', total: '0' },
    ];
    it('descarta áreas vacías, conserva coordenadas y resuelve empates de estado', async () => {
      qb()
        .getRawMany.mockResolvedValueOnce(points)
        .mockResolvedValue([{ status: 'Abierto', total: '6' }]);
      const result = await invoke(
        'findHeatmapByFilters',
        1,
        start,
        end,
        [4],
        undefined,
        [8],
      );
      expect(result).toMatchObject({
        totalAreas: 2,
        totalEvidences: 7,
        totalOpenEvidences: 6,
        totalOpenEvidencesWithCoordinates: 2,
        maxX: 30,
        maxY: 40,
        maxValue: 4,
      });
      expect(
        result.points.map((p) => [p.areaId, p.dominantStatus, p.zoomLevel]),
      ).toEqual([
        [1, 'Abierto', 2],
        [2, 'Cerrado', null],
      ]);
    });
    it('devuelve un mapa vacío si no existen coordenadas', async () =>
      expect(await invoke('findHeatmapByFilters')).toMatchObject({
        points: [],
        totalAreas: 0,
        totalEvidences: 0,
        maxX: 0,
        maxY: 0,
        maxValue: 0,
      }));
    it('usa responsables y su fallback a supervisores', async () => {
      qb()
        .getRawMany.mockResolvedValueOnce([])
        .mockResolvedValueOnce(points)
        .mockResolvedValue([]);
      const result = await invoke(
        'findHeatmapByFilters',
        1,
        start,
        end,
        [4],
        [11],
        [8],
      );
      expect(result.totalEvidences).toBe(7);
      expect(qb().innerJoin).toHaveBeenCalledWith(
        'evidence_supervisors_user',
        'esu',
        expect.any(String),
      );
    });
  });
  describe('pronóstico mensual', () => {
    it('rellena meses sin registros y proyecta tres meses con media ponderada', async () => {
      qb().getRawMany.mockResolvedValue([
        { monthKey: '2026-01', total: '10' },
        { monthKey: '2026-03', total: '20' },
        { monthKey: '2026-04', total: '30' },
      ]);
      const result = await invoke(
        'findAreaRangeLineByFilters',
        1,
        start,
        end,
        [4],
        [11],
        [8],
      );
      expect(result.categories).toEqual([
        '2026-01',
        '2026-02',
        '2026-03',
        '2026-04',
        '2026-05',
        '2026-06',
        '2026-07',
      ]);
      expect(result.actualSeries).toEqual([10, 0, 20, 30, null, null, null]);
      expect(result.forecastSeries).toEqual([null, null, null, 30, 19, 21, 22]);
      expect(result.rangeSeries).toHaveLength(7);
      expect(result.rangeSeries[3]).toEqual([30, 30]);
      for (const range of result.rangeSeries.slice(4))
        expect(range[0]).toBeGreaterThanOrEqual(0);
    });
    it('sin datos proyecta ceros y nunca límites negativos', async () => {
      const result = await invoke(
        'findAreaRangeLineByFilters',
        1,
        '01/12/2026',
        '31/12/2026',
      );
      expect(result.categories).toEqual([
        '2026-12',
        '2027-01',
        '2027-02',
        '2027-03',
      ]);
      expect(result.forecastSeries).toEqual([0, 0, 0, 0]);
      expect(result.rangeSeries).toEqual([
        [0, 0],
        [0, 1],
        [0, 2],
        [0, 2],
      ]);
    });
    it('el pronóstico aplica el mismo fallback de responsable a supervisor', async () => {
      qb()
        .getRawMany.mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ monthKey: '2026-01', total: '4' }]);
      const result = await invoke(
        'findAreaRangeLineByFilters',
        1,
        start,
        end,
        [],
        [11],
      );
      expect(result.actualSeries[0]).toBe(4);
      expect(qb().innerJoin).toHaveBeenCalledWith(
        'evidence_supervisors_user',
        'esu',
        expect.any(String),
      );
    });
  });
  describe('selector de responsables', () => {
    const call = (areas: number[] = [4]) =>
      as(() => service.findResponsiblesByFilters(1, start, end, areas, [8]));
    it('devuelve identificadores numéricos y solo usuarios del área', async () => {
      qb().getRawMany.mockResolvedValue([{ id: '11', name: 'Ana' }]);
      expect(await call()).toEqual([{ id: 11, name: 'Ana' }]);
      expect(qb().andWhere).toHaveBeenCalledWith(
        'zone."areaId" IN (:...areaIds)',
        { areaIds: [4] },
      );
    });
    it('consulta supervisores cuando no hay responsables', async () => {
      qb()
        .getRawMany.mockResolvedValueOnce([])
        .mockResolvedValue([{ id: '12', name: 'Sofía' }]);
      expect(await call()).toEqual([{ id: 12, name: 'Sofía' }]);
    });
    it('exige áreas explícitas', async () => {
      await expect(call([])).rejects.toThrow('areaIds es obligatorio');
      expect(evidence.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
  describe('histórico mensual', () => {
    afterEach(() => jest.useRealTimers());
    it('sin plantas no hace consultas ni inventa un rango', async () => {
      const session = buildUser({ ...user, manufacturingPlants: [] });
      expect(await as(() => service.findHistoricalByMonth(), session)).toEqual({
        startMonth: '',
        endMonth: '',
        categories: [],
        series: [],
      });
      expect(evidence.createQueryBuilder).not.toHaveBeenCalled();
    });
    it('sin fecha inicial devuelve un histórico vacío', async () =>
      expect(await as(() => service.findHistoricalByMonth())).toMatchObject({
        categories: [],
        series: [],
      }));
    it('rellena huecos, separa plantas y ordena por nombre', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-04-15T12:00:00Z'));
      qb().getRawOne.mockResolvedValue({
        minDate: new Date('2026-01-10T12:00:00Z'),
      });
      qb().getRawMany.mockResolvedValue([
        { monthKey: '2026-01', plantId: '1', plantName: 'Zeta', total: '3' },
        { monthKey: '2026-04', plantId: '1', plantName: 'Zeta', total: '4' },
        { monthKey: '2026-02', plantId: '2', plantName: 'Alfa', total: '2' },
        { monthKey: '2025-12', plantId: '2', plantName: 'Alfa', total: '99' },
      ]);
      const result = await as(() => service.findHistoricalByMonth());
      expect(result).toEqual({
        startMonth: '2026-01',
        endMonth: '2026-04',
        categories: ['2026-01', '2026-02', '2026-03', '2026-04'],
        series: [
          { name: 'Alfa', data: [0, 2, 0, 0] },
          { name: 'Zeta', data: [3, 0, 0, 4] },
        ],
      });
      expect(qb().where).toHaveBeenCalledWith(
        'evidence."manufacturingPlantId" IN (:...plantIds)',
        { plantIds: [1, 2] },
      );
    });
  });
  describe('distribución por planta', () => {
    beforeEach(() =>
      plants.find.mockResolvedValue([
        {
          id: 1,
          name: 'México',
          evidences: [
            {
              status: 'Abierto',
              zone: { name: 'Norte' },
              mainType: { name: 'Acto' },
            },
            {
              status: 'Cerrado',
              zone: { name: 'Norte' },
              mainType: { name: 'Condición' },
            },
          ],
        },
        {
          id: 2,
          name: 'Colombia',
          evidences: [
            {
              status: 'Abierto',
              zone: { name: 'Sur' },
              mainType: { name: 'Acto' },
            },
          ],
        },
      ] as ManufacturingPlant[]),
    );
    it('limita los registros a las plantas asignadas', async () => {
      await as(() => service.findManufacturingPlantsWithEvidences());
      expect((plants.find.mock.calls[0][0].where as any).id.value).toEqual([
        1, 2,
      ]);
    });
    it('calcula proporciones por estado y conserva el detalle de cada planta', async () => {
      const result = await as(() => service.findAllStatus());
      expect(result.statusData.map((p) => p.y)).toEqual([66.67, 33.33]);
      expect(result.statusSeries[0].data).toEqual([
        ['Abierto (1)', 50],
        ['Cerrado (1)', 50],
      ]);
    });
    it('agrupa zonas repetidas dentro de cada planta', async () => {
      const result = await as(() => service.findAllZones());
      expect(result.statusSeries.map((p) => p.data)).toEqual([
        [['Norte (2)', 100]],
        [['Sur (1)', 100]],
      ]);
    });
    it('los ids de drilldown coinciden con las series de tipos', async () => {
      const result = await as(() => service.findAllMainTypes());
      expect(result.series[0].data.map((p) => p.drilldown)).toEqual(
        result.drilldown.series.map((p) => p.id),
      );
      expect(result.drilldown.series[0].data).toEqual([
        ['Acto (1)', 50],
        ['Condición (1)', 50],
      ]);
    });
    it('sin hallazgos entrega series vacías sin NaN', async () => {
      plants.find.mockResolvedValue([]);
      expect(await as(() => service.findAllStatus())).toEqual({
        statusData: [],
        statusSeries: [],
      });
      expect(await as(() => service.findAllZones())).toEqual({
        statusData: [],
        statusSeries: [],
      });
      expect(
        (await as(() => service.findAllMainTypes())).series[0].data,
      ).toEqual([]);
    });
  });
  it('agrupa el ranking de reportantes por planta', async () => {
    const rows = [
      { manufacturingplantname: 'México', username: 'Ana', total: '3' },
      { manufacturingplantname: 'Colombia', username: 'Luis', total: '2' },
      { manufacturingplantname: 'México', username: 'Juan', total: '1' },
    ];
    query.mockResolvedValue(rows);
    expect(await as(() => service.findTopUsersByPlant())).toEqual({
      data: [
        { name: 'México', data: [rows[0], rows[2]] },
        { name: 'Colombia', data: [rows[1]] },
      ],
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('IN ( 1,2 )'));
  });
  it('convierte conteos de abiertos y cerrados sin mezclar plantas', async () => {
    query.mockResolvedValue([
      { manufacturingplantname: 'México', open: '3', closed: '2' },
      { manufacturingplantname: 'Colombia', open: '1', closed: '4' },
    ]);
    const result = await as(() => service.findOpenVsClosed());
    expect(result.categories).toEqual(['México', 'Colombia']);
    expect(result.series.map((s) => s.data)).toEqual([
      [3, 1],
      [2, 4],
    ]);
  });
  it('meses de hallazgos traduce etiquetas y rellena ausencias por planta', async () => {
    query
      .mockResolvedValueOnce([{ mon: 'Jan' }, { mon: 'Feb' }, { mon: 'Mar' }])
      .mockResolvedValueOnce([{ mon: 'Jan', name: 'México', total: '3' }])
      .mockResolvedValueOnce([{ mon: 'Feb', name: 'Colombia', total: '4' }])
      .mockResolvedValueOnce([]);
    expect(await as(() => service.findAllEvidencesByMonth(2026))).toEqual({
      categories: ['Ene', 'Feb', 'Mar'],
      series: [
        { name: 'México', data: [3, 0, 0] },
        { name: 'Colombia', data: [0, 4, 0] },
      ],
    });
    expect(query.mock.calls[0][0]).toContain('2026');
  });
  it('conserva etiquetas desconocidas sin datos anuales', async () => {
    query
      .mockResolvedValueOnce([{ mon: 'Otro' }])
      .mockResolvedValueOnce([{ mon: 'Otro', name: 'México', total: '2' }]);
    expect(await as(() => service.findAllEvidencesByMonth())).toEqual({
      categories: ['Otro'],
      series: [{ name: 'México', data: [2] }],
    });
    expect(query.mock.calls[0][0]).toContain("date_part('year', CURRENT_DATE)");
  });
  it('arma el análisis EPP: gráficas, indicadores a la fecha y precios', async () => {
    for (const n of [1, 3, 4, 8, 9])
      query.mockResolvedValueOnce([{ chart: n }]);
    query.mockResolvedValueOnce([
      {
        ini_actual: '2026-10-01',
        fin_actual: '2026-10-22',
        ini_anterior: '2026-09-01',
        fin_anterior: '2026-09-22',
        gasto_actual: '150.50',
        gasto_anterior: '100',
        unidades_actual: '7',
        unidades_anterior: '5',
        entregas_actual: '6',
        entregas_anterior: '4',
        fuera_de_rango_actual: '2',
        fuera_de_rango_anterior: '1',
        empleados_actual: '3',
        empleados_anterior: '2',
        primera_vez_actual: '1',
        primera_vez_anterior: '0',
        promedio_global: '42.10',
      },
    ]);
    query.mockResolvedValueOnce([{ has_prices: true }]);

    const result = await service.findBusinessIntelligenceEpp(
      1,
      '01/10/2026',
      '22/10/2026',
    );

    expect(query).toHaveBeenCalledTimes(7);
    expect(result).toMatchObject({
      hasPrices: true,
      chart1: [{ chart: 1 }],
      chart3: [{ chart: 3 }],
      chart4: [{ chart: 4 }],
      chart8: [{ chart: 8 }],
      chart9: [{ chart: 9 }],
      kpis: {
        periodo: {
          actual: { desde: '2026-10-01', hasta: '2026-10-22' },
          anterior: { desde: '2026-09-01', hasta: '2026-09-22' },
        },
        actual: {
          gasto: 150.5,
          unidades: 7,
          entregas: 6,
          fueraDeRango: 2,
          empleados: 3,
          primeraVez: 1,
        },
        anterior: {
          gasto: 100,
          unidades: 5,
          entregas: 4,
          fueraDeRango: 1,
          empleados: 2,
          primeraVez: 0,
        },
        promedioGlobal: 42.1,
      },
    });
    // Ya no se calculan precio vigente, cobertura ni equipos de nuevos.
    expect(result).not.toHaveProperty('chart2');
    expect(result).not.toHaveProperty('chart5');
    expect(result).not.toHaveProperty('chart7');
  });
  it('envía planta y periodos como parámetros y no pierde entregas sin precio', async () => {
    query.mockResolvedValue([{}]);
    await service.findBusinessIntelligenceEpp(7, '01/08/2026', '22/10/2026');
    const sql = query.mock.calls.map(([text]) => String(text)).join(' ');

    expect(sql).toContain('LEFT JOIN precio_vigente');
    expect(sql).not.toMatch(/JOIN equipment_cost_history ech/);
    // Sin valores dentro del SQL: todo viaja como parámetro.
    expect(sql).not.toContain('CURRENT_DATE');
    expect(sql).not.toContain('= 7');
    // 6 consultas con planta + periodo y comparación; la de precios, planta.
    const params = query.mock.calls.map(([, values]) => values);
    expect(params.slice(0, 6)).toEqual(
      Array(6).fill([
        7,
        '2026-08-01',
        '2026-10-22',
        '2026-05-01',
        '2026-07-22',
      ]),
    );
    expect(params[6]).toEqual([7]);
  });
  it('rechaza un periodo inválido sin consultar la base', async () => {
    await expect(
      service.findBusinessIntelligenceEpp(1, '22/10/2026', '01/10/2026'),
    ).rejects.toThrow(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });
  it('sin precios ni entregas responde ceros, y un error SQL no entrega resultados parciales', async () => {
    query.mockResolvedValue([{}]);
    const empty = await service.findBusinessIntelligenceEpp(1);
    expect(empty.hasPrices).toBe(false);
    expect(empty.kpis.actual).toEqual({
      gasto: 0,
      unidades: 0,
      entregas: 0,
      fueraDeRango: 0,
      empleados: 0,
      primeraVez: 0,
    });

    query.mockRejectedValue(Error('SQL failed'));
    await expect(service.findBusinessIntelligenceEpp(1)).rejects.toThrow(
      'SQL failed',
    );
  });
  it('fuera de rango: por equipo y por colaborador, con números y anticipación', async () => {
    query
      .mockResolvedValueOnce([
        {
          equipment_id: 36,
          equipment_name: 'Guante',
          entregas: '10',
          fuera_de_rango: '4',
          colaboradores: '3',
          dias_anticipacion_promedio: '12',
        },
      ])
      .mockResolvedValueOnce([
        {
          employee_id: 5,
          name: 'Ana',
          code: 123,
          area: 'Producción',
          position: 'Operador',
          equipment_id: 36,
          equipment_name: 'Guante',
          entregas: '3',
          fuera_de_rango: '2',
          dias_anticipacion_promedio: null,
          ultima_entrega: '2026-10-20',
        },
      ]);

    const result = await service.findBusinessIntelligenceEppOutOfRange(
      1,
      '01/10/2026',
      '22/10/2026',
    );

    expect(query.mock.calls.map(([, params]) => params)).toEqual([
      [1, '2026-10-01', '2026-10-22'],
      [1, '2026-10-01', '2026-10-22'],
    ]);
    expect(String(query.mock.calls[0][0])).toContain('LAG(ee."deliveryDate")');
    expect(result).toEqual({
      periodo: { desde: '2026-10-01', hasta: '2026-10-22' },
      byEquipment: [
        {
          equipmentId: 36,
          equipmentName: 'Guante',
          deliveries: 10,
          outOfRange: 4,
          employees: 3,
          averageDaysEarly: 12,
        },
      ],
      byEmployeeEquipment: [
        {
          employeeId: 5,
          name: 'Ana',
          code: '123',
          area: 'Producción',
          position: 'Operador',
          equipmentId: 36,
          equipmentName: 'Guante',
          deliveries: 3,
          outOfRange: 2,
          averageDaysEarly: null,
          lastDelivery: '2026-10-20',
        },
      ],
    });
  });
  it('detalle de colaborador: sus entregas con anticipación y quién registró', async () => {
    query
      .mockResolvedValueOnce([
        { id: 5, name: 'Ana', code: 123, area: null, position: null },
      ])
      .mockResolvedValueOnce([
        {
          id: 90,
          fecha: '2026-10-20',
          equipment_name: 'Guante',
          unidades: 1,
          frecuencia: 15,
          entrega_anterior: '2026-10-10',
          fuera_de_rango: true,
          dias_anticipacion: 5,
          registro: 'C. Seguridad',
        },
      ]);

    const result = await service.findBusinessIntelligenceEppEmployee(
      1,
      5,
      '01/10/2026',
      '22/10/2026',
    );

    expect(query.mock.calls[0][1]).toEqual([5, 1]);
    expect(query.mock.calls[1][1]).toEqual([1, '2026-10-01', '2026-10-22', 5]);
    expect(result.employee).toEqual({
      id: 5,
      name: 'Ana',
      code: '123',
      area: null,
      position: null,
    });
    expect(result.deliveries).toEqual([
      {
        id: 90,
        date: '2026-10-20',
        equipmentName: 'Guante',
        quantity: 1,
        frequencyDays: 15,
        previousDelivery: '2026-10-10',
        outOfRange: true,
        daysEarly: 5,
        registeredBy: 'C. Seguridad',
      },
    ]);
  });
  it('detalle de colaborador de otra planta: 404 sin consultar sus entregas', async () => {
    query.mockResolvedValueOnce([]);
    await expect(
      service.findBusinessIntelligenceEppEmployee(1, 99),
    ).rejects.toThrow(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
