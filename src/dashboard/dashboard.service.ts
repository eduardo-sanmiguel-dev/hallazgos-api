import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RequestContextService } from '../shared/services/request-context.service.js';

import { Repository, SelectQueryBuilder } from 'typeorm';

import { ManufacturingPlant } from '../manufacturing-plants/entities/manufacturing-plant.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Evidence } from '../evidences/entities/evidence.entity.js';
import { MainType } from '../main-types/entities/main-type.entity.js';
import {
  PRIORITY_LEVELS,
  RISK_LEVELS,
  riskLevelSqlCase,
} from '../shared/constants/priority.js';
import { resolveBiEppPeriod } from './bi-epp-period.js';

/** Hallazgos de una planta y su desglose [etiqueta, cantidad]. */
interface PlantEvidenceCount {
  name: string;
  total: number;
  groups: [string, number][];
}

const NO_ZONE_LABEL = 'Sin zona';
const NO_MAIN_TYPE_LABEL = 'Sin tipo';

// Estados conocidos en su orden habitual; cualquier otro, al final.
const STATUS_ORDER = ['Abierto', 'En progreso', 'Cerrado', 'Cancelado'];
const statusRank = (status: string) => {
  const index = STATUS_ORDER.indexOf(status);
  return index === -1 ? STATUS_ORDER.length : index;
};

/** Rol de los usuarios elegidos en el filtro "Responsable" del dashboard. */
type ResponsibleRole = 'responsible' | 'supervisor';

const ROLE_JOIN = {
  responsible: { table: 'evidence_responsibles_user', alias: 'eru' },
  supervisor: { table: 'evidence_supervisors_user', alias: 'esu' },
} as const;

/**
 * Limita una consulta (alias `evidence`) a los hallazgos donde `userIds`
 * tienen ese rol. Sin rol, la deja igual.
 */
const filterByRole = (
  query: SelectQueryBuilder<Evidence>,
  role: ResponsibleRole | null,
  userIds: number[],
) => {
  if (!role) return query;
  const { table, alias } = ROLE_JOIN[role];
  return query
    .innerJoin(table, alias, `${alias}."evidenceId" = evidence.id`)
    .andWhere(`${alias}."userId" IN (:...responsibleIds)`, {
      responsibleIds: userIds,
    });
};

/**
 * Filtro "Responsable" de las gráficas: los hallazgos donde esos usuarios son
 * responsables; si no hay ninguno, donde son supervisores (un supervisor sin
 * responsables ve lo que supervisa). Sin usuarios elegidos, sin filtro.
 * `role` dice cuál se usó, para que otra consulta de la misma gráfica (p. ej.
 * un conteo complementario) siga la misma decisión.
 */
const byResponsibleOrSupervisor = async <R>(
  responsibleIds: number[] | undefined,
  build: () => SelectQueryBuilder<Evidence>,
  run: (query: SelectQueryBuilder<Evidence>) => Promise<R>,
  isEmpty: (result: NoInfer<R>) => boolean,
): Promise<{ result: R; role: ResponsibleRole | null }> => {
  if (!responsibleIds?.length) {
    return { result: await run(build()), role: null };
  }
  const asResponsible = await run(
    filterByRole(build(), 'responsible', responsibleIds),
  );
  if (!isEmpty(asResponsible)) {
    return { result: asResponsible, role: 'responsible' };
  }
  return {
    result: await run(filterByRole(build(), 'supervisor', responsibleIds)),
    role: 'supervisor',
  };
};

/** Sin filas (para byResponsibleOrSupervisor con getRawMany). */
const noRows = (rows: unknown[]) => rows.length === 0;
/** Conteo en cero o sin fila (para byResponsibleOrSupervisor con getRawOne). */
const zeroTotal = (row: { total?: string | number } | undefined) =>
  Number(row?.total || 0) === 0;

@Injectable()
export class DashboardService {
  private readonly restrictedDashboardEmail = 'glora@hadainternational.com';
  private readonly excludedMainTypesForRestrictedEmail = [
    'Comportamiento inseguro',
    'Condición insegura',
  ];

  constructor(
    @InjectRepository(ManufacturingPlant)
    private readonly manufacturingPlant: Repository<ManufacturingPlant>,
    @InjectRepository(Evidence)
    private readonly evidenceRepository: Repository<Evidence>,
    @InjectRepository(MainType)
    private readonly mainTypeRepository: Repository<MainType>,
    private readonly requestContext: RequestContextService,
  ) {}

  private normalizeForComparison(value: string) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  /**
   * Lo que, además de los filtros, cambia una gráfica según quién consulta:
   * el usuario con tipos de hallazgo ocultos y las plantas del usuario (sin
   * planta elegida se usan las suyas). Parte de la llave del caché.
   */
  cacheScope() {
    return {
      restricted: this.isRestrictedDashboardUser(),
      plants: [...this.requestContext.manufacturingPlantIds].sort(
        (a, b) => a - b,
      ),
    };
  }

  private isRestrictedDashboardUser() {
    const user = this.requestContext.userOrNull;
    const currentEmail = this.normalizeForComparison(user?.email);

    return (
      currentEmail ===
      this.normalizeForComparison(this.restrictedDashboardEmail)
    );
  }

  private async resolveScopedMainTypeIds(mainTypeIds?: number[]) {
    const providedMainTypeIds = Array.from(
      new Set(
        (mainTypeIds || []).filter(
          (id) => Number.isInteger(id) && Number(id) > 0,
        ),
      ),
    );

    if (!this.isRestrictedDashboardUser()) {
      return providedMainTypeIds.length > 0 ? providedMainTypeIds : undefined;
    }

    const excluded = new Set(
      this.excludedMainTypesForRestrictedEmail.map((name) =>
        this.normalizeForComparison(name),
      ),
    );

    const activeMainTypes = await this.mainTypeRepository.find({
      where: { isActive: true },
    });

    const allowedMainTypeIds = activeMainTypes
      .filter((item) => !excluded.has(this.normalizeForComparison(item.name)))
      .map((item) => item.id);

    if (providedMainTypeIds.length > 0) {
      const allowedIdsSet = new Set(allowedMainTypeIds);
      const intersection = providedMainTypeIds.filter((id) =>
        allowedIdsSet.has(id),
      );

      return intersection.length > 0 ? intersection : [-1];
    }

    return allowedMainTypeIds.length > 0 ? allowedMainTypeIds : [-1];
  }

  private parseDateFilter(
    date: string,
    label: string,
    isEndDate = false,
  ): Date {
    if (typeof date !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(date))
      throw new BadRequestException(
        `${label} debe tener el formato DD/MM/YYYY`,
      );
    const [day, month, year] = date.split('/').map(Number);
    const parsedDate = new Date(year || 0, (month || 1) - 1, day || 0);

    const hasValidShape =
      !!day &&
      !!month &&
      !!year &&
      parsedDate.getFullYear() === year &&
      parsedDate.getMonth() === month - 1 &&
      parsedDate.getDate() === day;

    if (!hasValidShape || Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException(
        `${label} debe tener el formato DD/MM/YYYY`,
      );
    }

    if (isEndDate) {
      parsedDate.setHours(23, 59, 59, 999);
      return parsedDate;
    }

    parsedDate.setHours(0, 0, 0, 0);
    return parsedDate;
  }

  /** Hoy en la zona horaria del servidor, como 'YYYY-MM-DD'. */
  private today() {
    return new Date().toLocaleDateString('en-CA');
  }

  /** Consulta con parámetros ($1, $2…) en vez de valores dentro del SQL. */
  private queryWithParams(query: string, params: unknown[]) {
    return this.manufacturingPlant.manager.query(query, params);
  }

  /**
   * Análisis de datos EPP de una planta (solo administradores) en el periodo
   * elegido (por omisión, el mes en curso a la fecha) contra su periodo de
   * comparación (ver resolveBiEppPeriod).
   * - Precio: el vigente de cada equipo (último registro activo), unido con
   *   LEFT JOIN para que las entregas de equipos sin precio no desaparezcan de
   *   los conteos (solo aportan $0 al gasto).
   * - Las gráficas mensuales y la participación se limitan al periodo.
   */
  async findBusinessIntelligenceEpp(
    manufacturingPlantId: number,
    startDate?: string,
    endDate?: string,
  ) {
    const period = resolveBiEppPeriod(startDate, endDate, this.today());
    // $1 planta · $2-$3 periodo actual · $4-$5 periodo de comparación.
    const params = [
      manufacturingPlantId,
      period.actual.desde,
      period.actual.hasta,
      period.anterior.desde,
      period.anterior.hasta,
    ];

    const precioVigente = `
      precio_vigente AS (
        SELECT DISTINCT ON ("equipmentId") "equipmentId", COALESCE(price, 0) AS price
        FROM equipment_cost_history
        WHERE "isActive" = TRUE
        ORDER BY "equipmentId", "captureDate" DESC
      )`;

    const entregas = `
      ${precioVigente},
      entregas AS (
        SELECT
          ee."deliveryDate" AS fecha,
          eq.name AS equipment_name,
          e."employeeId" AS employee_id,
          COALESCE(ee.quantity, 0) AS unidades,
          COALESCE(ee.quantity, 0) * COALESCE(pv.price, 0) AS gasto,
          COALESCE(ee."outOfRangeDelivery", FALSE) AS fuera_de_rango
        FROM epp_equipment ee
          JOIN epp e ON e.id = ee."eppId"
          JOIN equipment eq ON eq.id = ee."equipmentId"
          LEFT JOIN precio_vigente pv ON pv."equipmentId" = eq.id
        WHERE eq."manufacturingPlantId" = $1
          AND ee."isActive" = TRUE
      ),
      periodo AS (
        SELECT $2::date AS ini_actual, $3::date AS fin_actual,
               $4::date AS ini_anterior, $5::date AS fin_anterior
      )`;

    // Filtros sobre `entregas` (alias en) y `periodo` (alias p).
    const actual = `en.fecha BETWEEN p.ini_actual AND p.fin_actual`;
    const anterior = `en.fecha BETWEEN p.ini_anterior AND p.fin_anterior`;

    // Gasto y unidades por equipo: periodo vs comparación.
    const gastoPorEquipo = `
      WITH ${entregas}
      SELECT
        en.equipment_name,
        COALESCE(SUM(en.gasto) FILTER (WHERE ${actual}), 0) AS gasto_mes_actual,
        COALESCE(SUM(en.unidades) FILTER (WHERE ${actual}), 0) AS unidades_mes_actual,
        COALESCE(SUM(en.gasto) FILTER (WHERE ${anterior}), 0) AS gasto_mes_anterior,
        COALESCE(SUM(en.unidades) FILTER (WHERE ${anterior}), 0) AS unidades_mes_anterior
      FROM entregas en CROSS JOIN periodo p
      WHERE ${actual} OR ${anterior}
      GROUP BY en.equipment_name
      HAVING SUM(en.gasto) > 0
      ORDER BY gasto_mes_actual DESC;
    `;

    // Entregas en rango vs fuera de rango por mes, dentro del periodo.
    const rangoPorMes = `
      WITH ${entregas}
      SELECT
        TO_CHAR(DATE_TRUNC('month', en.fecha), 'Mon YYYY') AS mes_label,
        DATE_TRUNC('month', en.fecha) AS mes,
        COUNT(*) AS total_entregas,
        COUNT(*) FILTER (WHERE en.fuera_de_rango) AS fuera_de_rango,
        COUNT(*) FILTER (WHERE NOT en.fuera_de_rango) AS en_rango,
        ROUND(COUNT(*) FILTER (WHERE en.fuera_de_rango) * 100.0 / COUNT(*), 2) AS pct_fuera_de_rango
      FROM entregas en CROSS JOIN periodo p
      WHERE ${actual}
      GROUP BY DATE_TRUNC('month', en.fecha)
      ORDER BY mes ASC;
    `;

    // Unidades y colaboradores por equipo: periodo vs comparación.
    const unidadesPorEquipo = `
      WITH ${entregas}
      SELECT
        en.equipment_name,
        COALESCE(SUM(en.unidades) FILTER (WHERE ${actual}), 0) AS unidades_mes_actual,
        COALESCE(SUM(en.unidades) FILTER (WHERE ${anterior}), 0) AS unidades_mes_anterior,
        COUNT(DISTINCT en.employee_id) FILTER (WHERE ${actual}) AS empleados_mes_actual,
        COUNT(DISTINCT en.employee_id) FILTER (WHERE ${anterior}) AS empleados_mes_anterior
      FROM entregas en CROSS JOIN periodo p
      WHERE ${actual} OR ${anterior}
      GROUP BY en.equipment_name
      ORDER BY unidades_mes_actual DESC;
    `;

    // Por mes dentro del periodo: gasto, unidades y colaboradores con entrega.
    const porMes = `
      WITH ${entregas}
      SELECT
        TO_CHAR(DATE_TRUNC('month', en.fecha), 'Mon YYYY') AS mes_label,
        DATE_TRUNC('month', en.fecha) AS mes_date,
        COALESCE(SUM(en.gasto), 0) AS gasto_total,
        COALESCE(SUM(en.unidades), 0) AS unidades_total,
        COUNT(DISTINCT en.employee_id) AS empleados_con_entrega,
        COALESCE(ROUND(SUM(en.gasto) / NULLIF(COUNT(DISTINCT en.employee_id), 0), 2), 0) AS gasto_promedio_por_empleado
      FROM entregas en CROSS JOIN periodo p
      WHERE ${actual}
      GROUP BY DATE_TRUNC('month', en.fecha)
      ORDER BY mes_date ASC;
    `;

    // Participación de cada equipo en el gasto del periodo.
    const participacion = `
      WITH ${entregas}
      SELECT
        en.equipment_name,
        SUM(en.gasto) AS gasto_total,
        SUM(en.unidades) AS unidades_total,
        ROUND(SUM(en.gasto) * 100.0 / NULLIF(SUM(SUM(en.gasto)) OVER (), 0), 2) AS pct_del_total
      FROM entregas en CROSS JOIN periodo p
      WHERE ${actual}
      GROUP BY en.equipment_name
      HAVING SUM(en.gasto) > 0
      ORDER BY gasto_total DESC;
    `;

    // Indicadores del periodo y de su comparación; el promedio global es
    // histórico (referencia fija).
    const indicadores = `
      WITH ${entregas},
      primera AS (SELECT employee_id, MIN(fecha) AS fecha FROM entregas GROUP BY employee_id)
      SELECT
        COALESCE(SUM(en.gasto) FILTER (WHERE ${actual}), 0) AS gasto_actual,
        COALESCE(SUM(en.gasto) FILTER (WHERE ${anterior}), 0) AS gasto_anterior,
        COALESCE(SUM(en.unidades) FILTER (WHERE ${actual}), 0) AS unidades_actual,
        COALESCE(SUM(en.unidades) FILTER (WHERE ${anterior}), 0) AS unidades_anterior,
        COUNT(en.fecha) FILTER (WHERE ${actual}) AS entregas_actual,
        COUNT(en.fecha) FILTER (WHERE ${anterior}) AS entregas_anterior,
        COUNT(en.fecha) FILTER (WHERE ${actual} AND en.fuera_de_rango) AS fuera_de_rango_actual,
        COUNT(en.fecha) FILTER (WHERE ${anterior} AND en.fuera_de_rango) AS fuera_de_rango_anterior,
        COUNT(DISTINCT en.employee_id) FILTER (WHERE ${actual}) AS empleados_actual,
        COUNT(DISTINCT en.employee_id) FILTER (WHERE ${anterior}) AS empleados_anterior,
        (SELECT COUNT(*) FROM primera WHERE primera.fecha BETWEEN p.ini_actual AND p.fin_actual) AS primera_vez_actual,
        (SELECT COUNT(*) FROM primera WHERE primera.fecha BETWEEN p.ini_anterior AND p.fin_anterior) AS primera_vez_anterior,
        (SELECT COALESCE(ROUND(SUM(gasto) / NULLIF(COUNT(DISTINCT employee_id), 0), 2), 0) FROM entregas) AS promedio_global
      FROM periodo p
        LEFT JOIN entregas en ON ${actual} OR ${anterior}
      GROUP BY p.ini_actual, p.fin_actual, p.ini_anterior, p.fin_anterior;
    `;

    // Qué controla la planta en sus equipos activos; la UI oculta lo demás:
    // - has_prices: algún equipo con precio (si no, todo lo de gasto).
    // - tracks_frequency: al menos la mitad con frecuencia de entrega (si no,
    //   lo de fuera de rango; un equipo suelto con frecuencia no basta).
    const configuracion = `
      WITH ${precioVigente}
      SELECT
        COALESCE(BOOL_OR(pv.price > 0), FALSE) AS has_prices,
        COUNT(*) > 0
          AND COUNT(*) FILTER (WHERE eq.delivery_frequency > 0) * 2 >= COUNT(*)
          AS tracks_frequency
      FROM equipment eq
        LEFT JOIN precio_vigente pv ON pv."equipmentId" = eq.id
      WHERE eq."manufacturingPlantId" = $1 AND eq.is_active = TRUE;
    `;

    const [chart1, chart3, chart4, chart8, chart9, [kpiRow], [config]] =
      await Promise.all([
        ...[
          gastoPorEquipo,
          rangoPorMes,
          unidadesPorEquipo,
          porMes,
          participacion,
          indicadores,
        ].map((query) => this.queryWithParams(query, params)),
        this.queryWithParams(configuracion, [manufacturingPlantId]),
      ]);

    const values = (key: 'actual' | 'anterior') => ({
      gasto: Number(kpiRow?.[`gasto_${key}`] ?? 0),
      unidades: Number(kpiRow?.[`unidades_${key}`] ?? 0),
      entregas: Number(kpiRow?.[`entregas_${key}`] ?? 0),
      fueraDeRango: Number(kpiRow?.[`fuera_de_rango_${key}`] ?? 0),
      empleados: Number(kpiRow?.[`empleados_${key}`] ?? 0),
      primeraVez: Number(kpiRow?.[`primera_vez_${key}`] ?? 0),
    });

    return {
      hasPrices: config?.has_prices === true,
      tracksDeliveryFrequency: config?.tracks_frequency === true,
      kpis: {
        periodo: period,
        actual: values('actual'),
        anterior: values('anterior'),
        promedioGlobal: Number(kpiRow?.promedio_global ?? 0),
      },
      // Gasto y unidades por equipo (periodo vs comparación).
      chart1,
      // Entregas en rango / fuera de rango por mes.
      chart3,
      // Unidades y colaboradores por equipo (periodo vs comparación).
      chart4,
      // Por mes: gasto, unidades, colaboradores y promedio.
      chart8,
      // Participación de cada equipo en el gasto del periodo.
      chart9,
    };
  }

  /**
   * Historial de entregas de la planta con la entrega anterior del mismo
   * equipo al mismo colaborador y, si fue fuera de rango, cuántos días antes
   * de tiempo se entregó. $1 planta · $2-$3 periodo.
   */
  private readonly historialEpp = `
    historial AS (
      SELECT
        ee.id,
        ee."deliveryDate" AS fecha,
        eq.id AS equipment_id,
        eq.name AS equipment_name,
        eq.delivery_frequency AS frecuencia,
        e."employeeId" AS employee_id,
        e."createById" AS registro_id,
        COALESCE(ee.quantity, 0) AS unidades,
        COALESCE(ee."outOfRangeDelivery", FALSE) AS fuera_de_rango,
        LAG(ee."deliveryDate") OVER (
          PARTITION BY e."employeeId", eq.id ORDER BY ee."deliveryDate", ee.id
        ) AS entrega_anterior
      FROM epp_equipment ee
        JOIN epp e ON e.id = ee."eppId"
        JOIN equipment eq ON eq.id = ee."equipmentId"
      WHERE eq."manufacturingPlantId" = $1
        AND ee."isActive" = TRUE
    ),
    periodo AS (SELECT $2::date AS ini, $3::date AS fin),
    en_periodo AS (
      SELECT h.*,
        CASE WHEN h.fuera_de_rango AND h.entrega_anterior IS NOT NULL AND h.frecuencia > 0
          THEN (h.entrega_anterior + h.frecuencia) - h.fecha END AS dias_anticipacion
      FROM historial h CROSS JOIN periodo p
      WHERE h.fecha BETWEEN p.ini AND p.fin
    )`;

  /**
   * Entregas fuera de rango del periodo: por equipo (cuáles y cuánto antes de
   * tiempo) y por colaborador y equipo (a quién), para el ranking y el filtro
   * por equipo de la UI.
   */
  async findBusinessIntelligenceEppOutOfRange(
    manufacturingPlantId: number,
    startDate?: string,
    endDate?: string,
  ) {
    const period = resolveBiEppPeriod(startDate, endDate, this.today());
    const params = [
      manufacturingPlantId,
      period.actual.desde,
      period.actual.hasta,
    ];

    const porEquipo = `
      WITH ${this.historialEpp}
      SELECT
        equipment_id,
        equipment_name,
        COUNT(*) AS entregas,
        COUNT(*) FILTER (WHERE fuera_de_rango) AS fuera_de_rango,
        COUNT(DISTINCT employee_id) FILTER (WHERE fuera_de_rango) AS colaboradores,
        ROUND(AVG(dias_anticipacion)) AS dias_anticipacion_promedio
      FROM en_periodo
      GROUP BY equipment_id, equipment_name
      HAVING COUNT(*) FILTER (WHERE fuera_de_rango) > 0
      ORDER BY fuera_de_rango DESC, equipment_name;
    `;

    // Todos los equipos de quienes tuvieron alguna entrega fuera de rango (el
    // total permite calcular su porcentaje).
    const porColaborador = `
      WITH ${this.historialEpp}
      SELECT
        r.employee_id,
        emp.name,
        emp.code,
        area.name AS area,
        pos.name AS position,
        r.equipment_id,
        r.equipment_name,
        COUNT(*) AS entregas,
        COUNT(*) FILTER (WHERE r.fuera_de_rango) AS fuera_de_rango,
        ROUND(AVG(r.dias_anticipacion)) AS dias_anticipacion_promedio,
        MAX(r.fecha)::text AS ultima_entrega
      FROM en_periodo r
        JOIN employee emp ON emp.id = r.employee_id
        LEFT JOIN employee_area area ON area.id = emp."areaId"
        LEFT JOIN employee_position pos ON pos.id = emp."positionId"
      WHERE r.employee_id IN (SELECT employee_id FROM en_periodo WHERE fuera_de_rango)
      GROUP BY r.employee_id, emp.name, emp.code, area.name, pos.name, r.equipment_id, r.equipment_name
      ORDER BY emp.name, r.equipment_name;
    `;

    const [byEquipment, byEmployeeEquipment] = await Promise.all(
      [porEquipo, porColaborador].map((query) =>
        this.queryWithParams(query, params),
      ),
    );

    const toNumber = (value: unknown) =>
      value === null || value === undefined ? null : Number(value);

    return {
      periodo: period.actual,
      byEquipment: byEquipment.map((row) => ({
        equipmentId: Number(row.equipment_id),
        equipmentName: row.equipment_name,
        deliveries: Number(row.entregas),
        outOfRange: Number(row.fuera_de_rango),
        employees: Number(row.colaboradores),
        averageDaysEarly: toNumber(row.dias_anticipacion_promedio),
      })),
      byEmployeeEquipment: byEmployeeEquipment.map((row) => ({
        employeeId: Number(row.employee_id),
        name: row.name,
        code: row.code === null ? null : String(row.code),
        area: row.area,
        position: row.position,
        equipmentId: Number(row.equipment_id),
        equipmentName: row.equipment_name,
        deliveries: Number(row.entregas),
        outOfRange: Number(row.fuera_de_rango),
        averageDaysEarly: toNumber(row.dias_anticipacion_promedio),
        lastDelivery: row.ultima_entrega,
      })),
    };
  }

  /**
   * Entregas de un colaborador en el periodo (para el detalle del análisis
   * fuera de rango): cuándo, qué, la entrega anterior, cuántos días antes de
   * tiempo y quién la registró. 404 si no es de la planta.
   */
  async findBusinessIntelligenceEppEmployee(
    manufacturingPlantId: number,
    employeeId: number,
    startDate?: string,
    endDate?: string,
  ) {
    const period = resolveBiEppPeriod(startDate, endDate, this.today());

    const [employee] = await this.queryWithParams(
      `
      SELECT emp.id, emp.name, emp.code, area.name AS area, pos.name AS position
      FROM employee emp
        JOIN employees_manufacturing_plants emp_plant ON emp_plant."employeeId" = emp.id
        LEFT JOIN employee_area area ON area.id = emp."areaId"
        LEFT JOIN employee_position pos ON pos.id = emp."positionId"
      WHERE emp.id = $1 AND emp_plant."manufacturingPlantId" = $2;
    `,
      [employeeId, manufacturingPlantId],
    );
    if (!employee) {
      throw new NotFoundException(`Colaborador #${employeeId} no encontrado`);
    }

    const deliveries = await this.queryWithParams(
      `
      WITH ${this.historialEpp}
      SELECT
        r.id,
        r.fecha::text AS fecha,
        r.equipment_name,
        r.unidades,
        r.frecuencia,
        r.entrega_anterior::text AS entrega_anterior,
        r.fuera_de_rango,
        r.dias_anticipacion,
        u.name AS registro
      FROM en_periodo r
        LEFT JOIN "user" u ON u.id = r.registro_id
      WHERE r.employee_id = $4
      ORDER BY r.fecha DESC, r.id DESC;
    `,
      [
        manufacturingPlantId,
        period.actual.desde,
        period.actual.hasta,
        employeeId,
      ],
    );

    return {
      periodo: period.actual,
      employee: {
        id: Number(employee.id),
        name: employee.name,
        code: employee.code === null ? null : String(employee.code),
        area: employee.area,
        position: employee.position,
      },
      deliveries: deliveries.map((row) => ({
        id: Number(row.id),
        date: row.fecha,
        equipmentName: row.equipment_name,
        quantity: Number(row.unidades),
        frequencyDays: row.frecuencia === null ? null : Number(row.frecuencia),
        previousDelivery: row.entrega_anterior,
        outOfRange: row.fuera_de_rango === true,
        daysEarly:
          row.dias_anticipacion === null ? null : Number(row.dias_anticipacion),
        registeredBy: row.registro,
      })),
    };
  }

  async findGlobalSummary(manufacturingPlantId: number) {
    const query = `
      SELECT
        mp.name                                                                                     AS planta,
        COALESCE(a.total, 0)                                                                       AS total,
        COALESCE(a.abiertas, 0)                                                                    AS abiertas,
        COALESCE(a.cerradas, 0)                                                                    AS cerradas,
        COALESCE(a.canceladas, 0)                                                                  AS canceladas,
        COALESCE(ROUND(COALESCE(a.cerradas, 0) * 100.0 / NULLIF(COALESCE(a.total, 0), 0), 1), 0) AS pct_resolucion_historica,
        COALESCE(ma.total, 0)       AS total_mes_actual,
        COALESCE(mp2.total, 0)      AS total_mes_anterior,
        COALESCE(ma.abiertas, 0)    AS abiertas_mes_actual,
        COALESCE(mp2.abiertas, 0)   AS abiertas_mes_anterior,
        COALESCE(ma.cerradas, 0)    AS cerradas_mes_actual,
        COALESCE(mp2.cerradas, 0)   AS cerradas_mes_anterior,
        COALESCE(ma.canceladas, 0)  AS canceladas_mes_actual,
        COALESCE(mp2.canceladas, 0) AS canceladas_mes_anterior,
        CASE
          WHEN COALESCE(mp2.total, 0) = 0 AND COALESCE(ma.total, 0) > 0 THEN 100.0
          WHEN COALESCE(mp2.total, 0) = 0                                THEN 0.0
          ELSE ROUND((COALESCE(ma.total, 0) - COALESCE(mp2.total, 0)) * 100.0 / COALESCE(mp2.total, 0), 1)
        END AS pct_total,
        CASE
          WHEN COALESCE(mp2.abiertas, 0) = 0 AND COALESCE(ma.abiertas, 0) > 0 THEN 100.0
          WHEN COALESCE(mp2.abiertas, 0) = 0                                    THEN 0.0
          ELSE ROUND((COALESCE(ma.abiertas, 0) - COALESCE(mp2.abiertas, 0)) * 100.0 / COALESCE(mp2.abiertas, 0), 1)
        END AS pct_abiertas,
        CASE
          WHEN COALESCE(mp2.cerradas, 0) = 0 AND COALESCE(ma.cerradas, 0) > 0 THEN 100.0
          WHEN COALESCE(mp2.cerradas, 0) = 0                                    THEN 0.0
          ELSE ROUND((COALESCE(ma.cerradas, 0) - COALESCE(mp2.cerradas, 0)) * 100.0 / COALESCE(mp2.cerradas, 0), 1)
        END AS pct_cerradas,
        CASE
          WHEN COALESCE(mp2.canceladas, 0) = 0 AND COALESCE(ma.canceladas, 0) > 0 THEN 100.0
          WHEN COALESCE(mp2.canceladas, 0) = 0                                      THEN 0.0
          ELSE ROUND((COALESCE(ma.canceladas, 0) - COALESCE(mp2.canceladas, 0)) * 100.0 / COALESCE(mp2.canceladas, 0), 1)
        END AS pct_canceladas
      FROM manufacturing_plant mp
      LEFT JOIN (
        SELECT "manufacturingPlantId",
          COUNT(*)                                          AS total,
          COUNT(CASE WHEN status = 'Abierto'   THEN 1 END) AS abiertas,
          COUNT(CASE WHEN status = 'Cerrado'   THEN 1 END) AS cerradas,
          COUNT(CASE WHEN status = 'Cancelado' THEN 1 END) AS canceladas
        FROM evidence
        GROUP BY "manufacturingPlantId"
      ) a ON mp.id = a."manufacturingPlantId"
      LEFT JOIN (
        SELECT "manufacturingPlantId",
          COUNT(*)                                          AS total,
          COUNT(CASE WHEN status = 'Abierto'   THEN 1 END) AS abiertas,
          COUNT(CASE WHEN status = 'Cerrado'   THEN 1 END) AS cerradas,
          COUNT(CASE WHEN status = 'Cancelado' THEN 1 END) AS canceladas
        FROM evidence
        WHERE "createdAt" >= DATE_TRUNC('month', NOW())
          AND "createdAt" <= NOW()
        GROUP BY "manufacturingPlantId"
      ) ma ON mp.id = ma."manufacturingPlantId"
      LEFT JOIN (
        SELECT "manufacturingPlantId",
          COUNT(*)                                          AS total,
          COUNT(CASE WHEN status = 'Abierto'   THEN 1 END) AS abiertas,
          COUNT(CASE WHEN status = 'Cerrado'   THEN 1 END) AS cerradas,
          COUNT(CASE WHEN status = 'Cancelado' THEN 1 END) AS canceladas
        FROM evidence
        WHERE "createdAt" >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
          AND "createdAt" <= NOW() - INTERVAL '1 month'
        GROUP BY "manufacturingPlantId"
      ) mp2 ON mp.id = mp2."manufacturingPlantId"
      WHERE mp."isActive" = true
        AND mp."id" = $1
        AND COALESCE(a.total, 0) > 0
      ORDER BY COALESCE(a.total, 0) DESC;
    `;

    const result = await this.queryWithParams(query, [manufacturingPlantId]);

    return result[0];
  }

  findCriticalZones(manufacturingPlantId: number) {
    const query = `
    SELECT
      mp.name                                                                                      AS planta,
      z.name                                                                                       AS zona,
      COUNT(DISTINCT e.id)                                                                         AS total_abiertas,
      MIN(e."createdAt")::date                                                                     AS hallazgo_mas_antiguo,
      EXTRACT(DAY FROM NOW() - MIN(e."createdAt"))::int                                            AS max_dias_sin_resolver,
      ROUND(AVG(EXTRACT(DAY FROM NOW() - e."createdAt"))::numeric, 1)                              AS promedio_dias_abierto,
      COUNT(DISTINCT CASE WHEN e."createdAt" >= DATE_TRUNC('month', NOW()) THEN e.id END)          AS nuevos_este_mes,
      COUNT(DISTINCT CASE WHEN e."createdAt" < DATE_TRUNC('month', NOW()) - INTERVAL '3 months' THEN e.id END) AS criticos_mas_90_dias,
      STRING_AGG(DISTINCT u.name, ', ' ORDER BY u.name)                                            AS responsables
    FROM evidence e
    JOIN manufacturing_plant mp              ON e."manufacturingPlantId" = mp.id
    JOIN zones z                             ON e."zoneId"               = z.id
    LEFT JOIN evidence_responsibles_user eru ON eru."evidenceId"         = e.id
    LEFT JOIN "user" u                       ON eru."userId"             = u.id
    WHERE mp."isActive" = true
      AND e.status = 'Abierto'
      AND mp."id" = $1
    GROUP BY mp.id, mp.name, z.id, z.name
    ORDER BY total_abiertas DESC, max_dias_sin_resolver DESC;
  `;

    return this.queryWithParams(query, [manufacturingPlantId]);
  }

  findRankingOfResponsibles(manufacturingPlantId: number) {
    const query = `SELECT
      u.id                                                                                      AS user_id,
      u.name                                                                                    AS responsable,
      mp.name                                                                                   AS planta,
      COALESCE(a.total, 0)                                                                      AS total_asignadas,
      COALESCE(a.abiertas, 0)                                                                   AS pendientes,
      COALESCE(a.cerradas, 0)                                                                   AS cerradas,
      COALESCE(a.canceladas, 0)                                                                 AS canceladas,
      COALESCE(ROUND(a.cerradas * 100.0 / NULLIF(a.total, 0), 1), 0)                          AS pct_resolucion,
      COALESCE(ma.total, 0)                                                                     AS total_mes_actual,
      COALESCE(mp2.total, 0)                                                                    AS total_mes_anterior,
      COALESCE(ma.abiertas, 0)                                                                  AS pendientes_mes_actual,
      COALESCE(mp2.abiertas, 0)                                                                 AS pendientes_mes_anterior,
      COALESCE(ma.cerradas, 0)                                                                  AS cerradas_mes_actual,
      COALESCE(mp2.cerradas, 0)                                                                 AS cerradas_mes_anterior,
      CASE
        WHEN COALESCE(mp2.total, 0) = 0 AND COALESCE(ma.total, 0) > 0 THEN 100.0
        WHEN COALESCE(mp2.total, 0) = 0                                THEN 0.0
        ELSE ROUND((COALESCE(ma.total, 0) - COALESCE(mp2.total, 0)) * 100.0 / COALESCE(mp2.total, 0), 1)
      END AS pct_carga,
      CASE
        WHEN COALESCE(mp2.cerradas, 0) = 0 AND COALESCE(ma.cerradas, 0) > 0 THEN 100.0
        WHEN COALESCE(mp2.cerradas, 0) = 0                                    THEN 0.0
        ELSE ROUND((COALESCE(ma.cerradas, 0) - COALESCE(mp2.cerradas, 0)) * 100.0 / COALESCE(mp2.cerradas, 0), 1)
      END AS pct_cerradas
    FROM "user" u
    JOIN user_manufacturing_plants ump ON ump."userId" = u.id
    JOIN manufacturing_plant mp        ON mp.id = ump."manufacturingPlantId"
    LEFT JOIN (
      SELECT eru."userId",
        COUNT(*)                                          AS total,
        COUNT(CASE WHEN e.status = 'Abierto'   THEN 1 END) AS abiertas,
        COUNT(CASE WHEN e.status = 'Cerrado'   THEN 1 END) AS cerradas,
        COUNT(CASE WHEN e.status = 'Cancelado' THEN 1 END) AS canceladas
      FROM evidence_responsibles_user eru
      JOIN evidence e ON eru."evidenceId" = e.id
      GROUP BY eru."userId"
    ) a ON u.id = a."userId"
    LEFT JOIN (
      SELECT eru."userId",
        COUNT(*)                                          AS total,
        COUNT(CASE WHEN e.status = 'Abierto'   THEN 1 END) AS abiertas,
        COUNT(CASE WHEN e.status = 'Cerrado'   THEN 1 END) AS cerradas,
        COUNT(CASE WHEN e.status = 'Cancelado' THEN 1 END) AS canceladas
      FROM evidence_responsibles_user eru
      JOIN evidence e ON eru."evidenceId" = e.id
      WHERE e."createdAt" >= DATE_TRUNC('month', NOW())
        AND e."createdAt" <= NOW()
      GROUP BY eru."userId"
    ) ma ON u.id = ma."userId"
    LEFT JOIN (
      SELECT eru."userId",
        COUNT(*)                                          AS total,
        COUNT(CASE WHEN e.status = 'Abierto'   THEN 1 END) AS abiertas,
        COUNT(CASE WHEN e.status = 'Cerrado'   THEN 1 END) AS cerradas,
        COUNT(CASE WHEN e.status = 'Cancelado' THEN 1 END) AS canceladas
      FROM evidence_responsibles_user eru
      JOIN evidence e ON eru."evidenceId" = e.id
      WHERE e."createdAt" >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
        AND e."createdAt" <= NOW() - INTERVAL '1 month'
      GROUP BY eru."userId"
    ) mp2 ON u.id = mp2."userId"
    WHERE mp."isActive" = true
      AND mp."id" = $1
      AND COALESCE(a.total, 0) > 0
    ORDER BY pendientes DESC, pct_resolucion ASC;`;

    return this.queryWithParams(query, [manufacturingPlantId]);
  }

  async findAverageResolutionTime(manufacturingPlantId: number) {
    const query = `
      SELECT
        mp.name                                                                                     AS planta,
        COALESCE(ROUND(AVG(
          EXTRACT(DAY FROM e."solutionDate" - e."createdAt")
        )::numeric, 1), 0)                                                                         AS promedio_dias_historico,
        COALESCE(COUNT(*), 0)                                                                      AS total_cerradas_historico,
        COALESCE(ROUND(AVG(CASE
          WHEN e."solutionDate" >= DATE_TRUNC('month', NOW())
          AND e."solutionDate" <= NOW()
          THEN EXTRACT(DAY FROM e."solutionDate" - e."createdAt")
        END)::numeric, 1), 0)                                                                      AS promedio_dias_mes_actual,
        COALESCE(COUNT(CASE
          WHEN e."solutionDate" >= DATE_TRUNC('month', NOW())
          AND e."solutionDate" <= NOW() THEN 1
        END), 0)                                                                                   AS total_cerradas_mes_actual,
        COALESCE(ROUND(AVG(CASE
          WHEN e."solutionDate" >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
          AND e."solutionDate" <= NOW() - INTERVAL '1 month'
          THEN EXTRACT(DAY FROM e."solutionDate" - e."createdAt")
        END)::numeric, 1), 0)                                                                      AS promedio_dias_mes_anterior,
        COALESCE(COUNT(CASE
          WHEN e."solutionDate" >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
          AND e."solutionDate" <= NOW() - INTERVAL '1 month' THEN 1
        END), 0)                                                                                   AS total_cerradas_mes_anterior,
        CASE
          WHEN COALESCE(AVG(CASE
            WHEN e."solutionDate" >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
            AND e."solutionDate" <= NOW() - INTERVAL '1 month'
            THEN EXTRACT(DAY FROM e."solutionDate" - e."createdAt") END), 0) = 0
          AND COALESCE(AVG(CASE
            WHEN e."solutionDate" >= DATE_TRUNC('month', NOW())
            AND e."solutionDate" <= NOW()
            THEN EXTRACT(DAY FROM e."solutionDate" - e."createdAt") END), 0) > 0 THEN 100.0
          WHEN COALESCE(AVG(CASE
            WHEN e."solutionDate" >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
            AND e."solutionDate" <= NOW() - INTERVAL '1 month'
            THEN EXTRACT(DAY FROM e."solutionDate" - e."createdAt") END), 0) = 0 THEN 0.0
          ELSE ROUND((
            COALESCE(AVG(CASE
              WHEN e."solutionDate" >= DATE_TRUNC('month', NOW())
              AND e."solutionDate" <= NOW()
              THEN EXTRACT(DAY FROM e."solutionDate" - e."createdAt") END), 0) -
            COALESCE(AVG(CASE
              WHEN e."solutionDate" >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
              AND e."solutionDate" <= NOW() - INTERVAL '1 month'
              THEN EXTRACT(DAY FROM e."solutionDate" - e."createdAt") END), 0)
          ) * 100.0 / NULLIF(COALESCE(AVG(CASE
            WHEN e."solutionDate" >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
            AND e."solutionDate" <= NOW() - INTERVAL '1 month'
            THEN EXTRACT(DAY FROM e."solutionDate" - e."createdAt") END), 0), 0), 1)
        END                                                                                         AS pct_cambio_promedio
      FROM manufacturing_plant mp
      JOIN evidence e ON e."manufacturingPlantId" = mp.id
      WHERE mp."isActive" = true
        AND mp."id" = $1
        AND e.status = 'Cerrado'
        AND e."solutionDate" IS NOT NULL
      GROUP BY mp.id, mp.name
      ORDER BY promedio_dias_historico DESC;
    `;

    const result = await this.queryWithParams(query, [manufacturingPlantId]);

    return result[0];
  }

  async findMonthlyTypeTrend(manufacturingPlantId: number) {
    const query = `
    SELECT
      mp.name  AS planta,
      mt.name  AS tipo_principal,
      COALESCE(a.total, 0)                                                        AS total_historico,
      COALESCE(ma.total, 0)                                                       AS total_mes_actual,
      COALESCE(mp2.total, 0)                                                      AS total_mes_anterior,
      CASE
        WHEN COALESCE(mp2.total, 0) = 0 AND COALESCE(ma.total, 0) > 0 THEN 100.0
        WHEN COALESCE(mp2.total, 0) = 0                                THEN 0.0
        ELSE ROUND((COALESCE(ma.total, 0) - COALESCE(mp2.total, 0)) * 100.0 / COALESCE(mp2.total, 0), 1)
      END AS pct_cambio
    FROM manufacturing_plant mp
    CROSS JOIN main_type mt
    LEFT JOIN (
      SELECT "manufacturingPlantId", "mainTypeId", COUNT(*) AS total
      FROM evidence
      WHERE status = 'Abierto'
      GROUP BY "manufacturingPlantId", "mainTypeId"
    ) a ON mp.id = a."manufacturingPlantId" AND mt.id = a."mainTypeId"
    LEFT JOIN (
      SELECT "manufacturingPlantId", "mainTypeId", COUNT(*) AS total
      FROM evidence
      WHERE status = 'Abierto'
        AND "createdAt" >= DATE_TRUNC('month', NOW())
        AND "createdAt" <= NOW()
      GROUP BY "manufacturingPlantId", "mainTypeId"
    ) ma ON mp.id = ma."manufacturingPlantId" AND mt.id = ma."mainTypeId"
    LEFT JOIN (
      SELECT "manufacturingPlantId", "mainTypeId", COUNT(*) AS total
      FROM evidence
      WHERE status = 'Abierto'
        AND "createdAt" >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
        AND "createdAt" <= NOW() - INTERVAL '1 month'
      GROUP BY "manufacturingPlantId", "mainTypeId"
    ) mp2 ON mp.id = mp2."manufacturingPlantId" AND mt.id = mp2."mainTypeId"
    WHERE mp."isActive" = true
      AND mp."id" = $1
      AND COALESCE(a.total, 0) > 0
    ORDER BY mp.name, a.total DESC;
    `;

    return this.queryWithParams(query, [manufacturingPlantId]);
  }

  findManufacturingPlantsIdsCurrentUser() {
    return this.requestContext.manufacturingPlantIds;
  }

  async findMonthlySubtypeTrend(manufacturingPlantId: number) {
    const query = `
    SELECT
      mp.name  AS planta,
      mt.name  AS tipo_principal,
      st.name  AS tipo_secundario,
      COALESCE(a.total, 0)                                                        AS total_historico,
      COALESCE(ma.total, 0)                                                       AS total_mes_actual,
      COALESCE(mp2.total, 0)                                                      AS total_mes_anterior,
      CASE
        WHEN COALESCE(mp2.total, 0) = 0 AND COALESCE(ma.total, 0) > 0 THEN 100.0
        WHEN COALESCE(mp2.total, 0) = 0                                THEN 0.0
        ELSE ROUND((COALESCE(ma.total, 0) - COALESCE(mp2.total, 0)) * 100.0 / COALESCE(mp2.total, 0), 1)
      END AS pct_cambio
    FROM manufacturing_plant mp
    CROSS JOIN secondary_type st
    JOIN main_type mt ON st."mainTypeId" = mt.id
    LEFT JOIN (
      SELECT "manufacturingPlantId", "secondaryTypeId", COUNT(*) AS total
      FROM evidence
      WHERE status = 'Abierto'
      GROUP BY "manufacturingPlantId", "secondaryTypeId"
    ) a ON mp.id = a."manufacturingPlantId" AND st.id = a."secondaryTypeId"
    LEFT JOIN (
      SELECT "manufacturingPlantId", "secondaryTypeId", COUNT(*) AS total
      FROM evidence
      WHERE status = 'Abierto'
        AND "createdAt" >= DATE_TRUNC('month', NOW())
        AND "createdAt" <= NOW()
      GROUP BY "manufacturingPlantId", "secondaryTypeId"
    ) ma ON mp.id = ma."manufacturingPlantId" AND st.id = ma."secondaryTypeId"
    LEFT JOIN (
      SELECT "manufacturingPlantId", "secondaryTypeId", COUNT(*) AS total
      FROM evidence
      WHERE status = 'Abierto'
        AND "createdAt" >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
        AND "createdAt" <= NOW() - INTERVAL '1 month'
      GROUP BY "manufacturingPlantId", "secondaryTypeId"
    ) mp2 ON mp.id = mp2."manufacturingPlantId" AND st.id = mp2."secondaryTypeId"
    WHERE mp."isActive" = true
      AND mp."id" = $1
      AND COALESCE(a.total, 0) > 0
    ORDER BY mp.name, mt.name, a.total DESC;
    `;

    return this.queryWithParams(query, [manufacturingPlantId]);
  }

  /**
   * Hallazgos de cada planta del usuario (activas) agrupados por estado,
   * zona o tipo, contados en la base con una sola consulta. Antes se
   * cargaban todas las evidencias con sus relaciones solo para contarlas en
   * memoria (lento y pesado a medida que crecen los datos).
   *
   * Plantas por id; dentro de cada una, los estados en su orden habitual y
   * las zonas y tipos de mayor a menor (empate: por nombre). Sin zona o sin
   * tipo se cuentan aparte (antes la petición fallaba).
   */
  private async countEvidencesByPlant(
    groupBy: 'status' | 'zone' | 'mainType',
  ): Promise<PlantEvidenceCount[]> {
    const manufacturingPlantsIds = this.findManufacturingPlantsIdsCurrentUser();
    if (!manufacturingPlantsIds?.length) return [];

    const query = this.evidenceRepository
      .createQueryBuilder('evidence')
      .innerJoin('evidence.manufacturingPlant', 'plant');

    let label: string;
    if (groupBy === 'zone') {
      query.leftJoin('evidence.zone', 'zone');
      label = `COALESCE(zone.name, '${NO_ZONE_LABEL}')`;
    } else if (groupBy === 'mainType') {
      query.leftJoin('evidence.mainType', 'mainType');
      label = `COALESCE(mainType.name, '${NO_MAIN_TYPE_LABEL}')`;
    } else {
      label = 'evidence.status';
    }

    const rows = await query
      .select('plant.id', 'plantId')
      .addSelect('plant.name', 'plantName')
      .addSelect(label, 'label')
      .addSelect('COUNT(*)', 'total')
      .where('plant.id IN (:...manufacturingPlantsIds)', {
        manufacturingPlantsIds,
      })
      .andWhere('plant."isActive" = true')
      .groupBy('plant.id')
      .addGroupBy('plant.name')
      .addGroupBy(label)
      .orderBy('plant.id', 'ASC')
      .getRawMany<{
        plantId: number;
        plantName: string;
        label: string;
        total: string;
      }>();

    const plantsById = new Map<number, PlantEvidenceCount>();
    for (const row of rows) {
      const plantId = Number(row.plantId);
      const total = Number(row.total);
      const plant = plantsById.get(plantId) ?? {
        name: row.plantName,
        total: 0,
        groups: [],
      };
      plant.total += total;
      plant.groups.push([row.label, total]);
      plantsById.set(plantId, plant);
    }

    const plants = [...plantsById.values()];
    for (const plant of plants) {
      plant.groups.sort(
        groupBy === 'status'
          ? ([a], [b]) => statusRank(a) - statusRank(b) || a.localeCompare(b)
          : ([a, totalA], [b, totalB]) => totalB - totalA || a.localeCompare(b),
      );
    }
    return plants;
  }

  /** Porcentaje con 2 decimales, como lo espera Highcharts. */
  private static percentage(part: number, whole: number): number {
    return Number(((part / whole) * 100).toFixed(2));
  }

  /**
   * Pastel de plantas con drilldown por grupo (estado o zona): forma que
   * esperan las gráficas de /dashboard/status y /dashboard/zones.
   */
  private static plantShareChart(plants: PlantEvidenceCount[]) {
    const evidencesTotal = plants.reduce((acc, plant) => acc + plant.total, 0);

    return {
      statusData: plants.map((plant) => ({
        name: `${plant.name} (${plant.total})`,
        y: DashboardService.percentage(plant.total, evidencesTotal),
        drilldown: plant.name,
      })),
      statusSeries: plants.map((plant) => ({
        name: plant.name,
        id: plant.name,
        data: plant.groups.map(([label, total]) => [
          `${label} (${total})`,
          DashboardService.percentage(total, plant.total),
        ]),
      })),
    };
  }

  async findAllStatus() {
    return DashboardService.plantShareChart(
      await this.countEvidencesByPlant('status'),
    );
  }

  async findStatusByFilters(
    manufacturingPlantId: number,
    startDate: string,
    endDate: string,
    areaIds?: number[],
    responsibleIds?: number[],
    mainTypeIds?: number[],
    states?: string[],
  ) {
    if (!manufacturingPlantId) {
      throw new BadRequestException('Selecciona una planta.');
    }

    if (!startDate || !endDate) {
      throw new BadRequestException(
        'Las fechas de inicio y fin son obligatorias',
      );
    }

    const parsedStartDate = this.parseDateFilter(
      startDate,
      'La fecha de inicio',
    );
    const parsedEndDate = this.parseDateFilter(
      endDate,
      'La fecha de fin',
      true,
    );

    if (parsedStartDate > parsedEndDate) {
      throw new BadRequestException(
        'La fecha de inicio no puede ser mayor a la fecha de fin',
      );
    }

    mainTypeIds = await this.resolveScopedMainTypeIds(mainTypeIds);

    // Conteo por estatus en un rango (el elegido o el de comparación).
    const countByStatus = async (rangeStart: Date, rangeEnd: Date) => {
      const buildBaseQuery = () => {
        const query = this.evidenceRepository
          .createQueryBuilder('evidence')
          .leftJoin('evidence.zone', 'zone')
          .select('evidence.status', 'status')
          .addSelect('COUNT(*)', 'total')
          .where('evidence."manufacturingPlantId" = :manufacturingPlantId', {
            manufacturingPlantId,
          })
          .andWhere('evidence."createdAt" BETWEEN :startDate AND :endDate', {
            startDate: rangeStart,
            endDate: rangeEnd,
          });

        if (areaIds && areaIds.length > 0) {
          query.andWhere('zone."areaId" IN (:...areaIds)', {
            areaIds,
          });
        }

        if (mainTypeIds && mainTypeIds.length > 0) {
          query.andWhere('evidence."mainTypeId" IN (:...mainTypeIds)', {
            mainTypeIds,
          });
        }

        if (states && states.length > 0) {
          query.andWhere('evidence.status IN (:...states)', { states });
        }

        return query;
      };

      let rows: { status: string; total: string }[] = [];

      rows = (
        await byResponsibleOrSupervisor(
          responsibleIds,
          () => buildBaseQuery(),
          (query) =>
            query
              .groupBy('evidence.status')
              .getRawMany<{ status: string; total: string }>(),
          noRows,
        )
      ).result;

      const statusOrder = ['Abierto', 'En progreso', 'Cerrado', 'Cancelado'];
      const totalsByStatus = rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = Number(row.total);
        return acc;
      }, {});

      const seriesData = statusOrder.map((status) => ({
        name: status,
        y: totalsByStatus[status] || 0,
      }));

      return {
        total: seriesData.reduce((acc, item) => acc + item.y, 0),
        seriesData,
      };
    };

    // Periodo de comparación, con la misma regla que el análisis EPP
    // (resolveBiEppPeriod). Para los indicadores del dashboard; si el rango
    // no admite comparación (más de 3 años), sin ella.
    const periodo = this.comparisonPeriod(startDate, endDate);
    // El periodo elegido y el anterior no dependen uno del otro: se cuentan
    // a la vez (antes, uno tras otro, y las gráficas esperan este resumen).
    const [{ total, seriesData }, anterior] = await Promise.all([
      countByStatus(parsedStartDate, parsedEndDate),
      periodo
        ? countByStatus(
            this.parseDateFilter(
              this.isoToDdMmYyyy(periodo.anterior.desde),
              'La fecha de inicio',
            ),
            this.parseDateFilter(
              this.isoToDdMmYyyy(periodo.anterior.hasta),
              'La fecha de fin',
              true,
            ),
          )
        : null,
    ]);

    return {
      total,
      startDate,
      endDate,
      seriesData,
      periodo,
      anterior,
    };
  }

  /** Periodo elegido y su comparación, o null si no la admite. */
  private comparisonPeriod(startDate: string, endDate: string) {
    try {
      return resolveBiEppPeriod(startDate, endDate, this.today());
    } catch (error) {
      if (error instanceof BadRequestException) return null;
      throw error;
    }
  }

  /** 'YYYY-MM-DD' → 'DD/MM/YYYY' (formato de los filtros). */
  private isoToDdMmYyyy(iso: string) {
    const [year, month, day] = iso.split('-');
    return `${day}/${month}/${year}`;
  }

  async findPriorityInterventionByFilters(
    manufacturingPlantId: number,
    startDate: string,
    endDate: string,
    areaIds?: number[],
    responsibleIds?: number[],
    mainTypeIds?: number[],
    states?: string[],
  ) {
    if (!manufacturingPlantId) {
      throw new BadRequestException('Selecciona una planta.');
    }

    if (!startDate || !endDate) {
      throw new BadRequestException(
        'Las fechas de inicio y fin son obligatorias',
      );
    }

    const parsedStartDate = this.parseDateFilter(
      startDate,
      'La fecha de inicio',
    );
    const parsedEndDate = this.parseDateFilter(
      endDate,
      'La fecha de fin',
      true,
    );

    if (parsedStartDate > parsedEndDate) {
      throw new BadRequestException(
        'La fecha de inicio no puede ser mayor a la fecha de fin',
      );
    }

    mainTypeIds = await this.resolveScopedMainTypeIds(mainTypeIds);

    const buildBaseQuery = () => {
      const query = this.evidenceRepository
        .createQueryBuilder('evidence')
        .leftJoin('evidence.zone', 'zone')
        .select('evidence."priorityDays"', 'priorityDays')
        .addSelect('COUNT(DISTINCT evidence.id)', 'total')
        .where('evidence."manufacturingPlantId" = :manufacturingPlantId', {
          manufacturingPlantId,
        })
        .andWhere('evidence."createdAt" BETWEEN :startDate AND :endDate', {
          startDate: parsedStartDate,
          endDate: parsedEndDate,
        })
        .andWhere('COALESCE(evidence."priorityDays", 0) > 0');

      if (areaIds && areaIds.length > 0) {
        query.andWhere('zone."areaId" IN (:...areaIds)', {
          areaIds,
        });
      }

      if (mainTypeIds && mainTypeIds.length > 0) {
        query.andWhere('evidence."mainTypeId" IN (:...mainTypeIds)', {
          mainTypeIds,
        });
      }

      if (states && states.length > 0) {
        query.andWhere('evidence.status IN (:...states)', { states });
      }

      return query;
    };

    // Conteo de los hallazgos sin prioridad asignada.
    const buildCountBaseQuery = () => {
      const query = this.evidenceRepository
        .createQueryBuilder('evidence')
        .leftJoin('evidence.zone', 'zone')
        .select('COUNT(DISTINCT evidence.id)', 'total')
        .where('evidence."manufacturingPlantId" = :manufacturingPlantId', {
          manufacturingPlantId,
        })
        .andWhere('evidence."createdAt" BETWEEN :startDate AND :endDate', {
          startDate: parsedStartDate,
          endDate: parsedEndDate,
        });

      query.andWhere('COALESCE(evidence."priorityDays", 0) <= 0');

      if (areaIds && areaIds.length > 0) {
        query.andWhere('zone."areaId" IN (:...areaIds)', {
          areaIds,
        });
      }

      if (mainTypeIds && mainTypeIds.length > 0) {
        query.andWhere('evidence."mainTypeId" IN (:...mainTypeIds)', {
          mainTypeIds,
        });
      }

      if (states && states.length > 0) {
        query.andWhere('evidence.status IN (:...states)', { states });
      }

      return query;
    };

    type RawPriority = {
      priorityDays: string;
      total: string;
    };

    let rows: RawPriority[] = [];

    rows = (
      await byResponsibleOrSupervisor(
        responsibleIds,
        () => buildBaseQuery(),
        (query) =>
          query.groupBy('evidence."priorityDays"').getRawMany<RawPriority>(),
        noRows,
      )
    ).result;

    const totalsByPriorityDays = rows.reduce<Record<number, number>>(
      (acc, row) => {
        const days = Number(row.priorityDays);

        if (!Number.isFinite(days)) {
          return acc;
        }

        acc[days] = Number(row.total || 0);
        return acc;
      },
      {},
    );

    const seriesData = PRIORITY_LEVELS.map((item) => ({
      name: item.name,
      days: item.days,
      y: totalsByPriorityDays[item.days] || 0,
      color: item.color,
    }));

    const totalWithPriority = seriesData.reduce((acc, item) => acc + item.y, 0);

    type RawCount = {
      total: string;
    };

    // Decide por su cuenta (responsables o supervisores), igual que antes.
    const { result: countRow } = await byResponsibleOrSupervisor(
      responsibleIds,
      () => buildCountBaseQuery(),
      (query) => query.getRawOne<RawCount>(),
      zeroTotal,
    );
    const totalWithoutPriority = Number(countRow?.total || 0);

    return {
      total: totalWithPriority,
      totalWithPriority,
      totalWithoutPriority,
      startDate,
      endDate,
      seriesData,
    };
  }

  async findRiskLevelByFilters(
    manufacturingPlantId: number,
    startDate: string,
    endDate: string,
    areaIds?: number[],
    responsibleIds?: number[],
    mainTypeIds?: number[],
    states?: string[],
  ) {
    if (!manufacturingPlantId) {
      throw new BadRequestException('Selecciona una planta.');
    }

    if (!startDate || !endDate) {
      throw new BadRequestException(
        'Las fechas de inicio y fin son obligatorias',
      );
    }

    const parsedStartDate = this.parseDateFilter(
      startDate,
      'La fecha de inicio',
    );
    const parsedEndDate = this.parseDateFilter(
      endDate,
      'La fecha de fin',
      true,
    );

    if (parsedStartDate > parsedEndDate) {
      throw new BadRequestException(
        'La fecha de inicio no puede ser mayor a la fecha de fin',
      );
    }

    mainTypeIds = await this.resolveScopedMainTypeIds(mainTypeIds);

    const riskCase = riskLevelSqlCase('evidence."priorityDays"');

    const buildBaseQuery = () => {
      const query = this.evidenceRepository
        .createQueryBuilder('evidence')
        .leftJoin('evidence.zone', 'zone')
        .select(riskCase, 'riskLevel')
        .addSelect('COUNT(DISTINCT evidence.id)', 'total')
        .where('evidence."manufacturingPlantId" = :manufacturingPlantId', {
          manufacturingPlantId,
        })
        .andWhere('evidence."createdAt" BETWEEN :startDate AND :endDate', {
          startDate: parsedStartDate,
          endDate: parsedEndDate,
        })
        .andWhere('COALESCE(evidence."priorityDays", 0) > 0');

      if (areaIds && areaIds.length > 0) {
        query.andWhere('zone."areaId" IN (:...areaIds)', {
          areaIds,
        });
      }

      if (mainTypeIds && mainTypeIds.length > 0) {
        query.andWhere('evidence."mainTypeId" IN (:...mainTypeIds)', {
          mainTypeIds,
        });
      }

      if (states && states.length > 0) {
        query.andWhere('evidence.status IN (:...states)', { states });
      }

      return query;
    };

    // Conteo de los hallazgos sin prioridad asignada.
    const buildCountBaseQuery = () => {
      const query = this.evidenceRepository
        .createQueryBuilder('evidence')
        .leftJoin('evidence.zone', 'zone')
        .select('COUNT(DISTINCT evidence.id)', 'total')
        .where('evidence."manufacturingPlantId" = :manufacturingPlantId', {
          manufacturingPlantId,
        })
        .andWhere('evidence."createdAt" BETWEEN :startDate AND :endDate', {
          startDate: parsedStartDate,
          endDate: parsedEndDate,
        });

      query.andWhere('COALESCE(evidence."priorityDays", 0) <= 0');

      if (areaIds && areaIds.length > 0) {
        query.andWhere('zone."areaId" IN (:...areaIds)', {
          areaIds,
        });
      }

      if (mainTypeIds && mainTypeIds.length > 0) {
        query.andWhere('evidence."mainTypeId" IN (:...mainTypeIds)', {
          mainTypeIds,
        });
      }

      if (states && states.length > 0) {
        query.andWhere('evidence.status IN (:...states)', { states });
      }

      return query;
    };

    type RawRisk = {
      riskLevel: string | null;
      total: string;
    };

    type RawCount = {
      total: string;
    };

    const { result: rows, role } = await byResponsibleOrSupervisor(
      responsibleIds,
      buildBaseQuery,
      (query) => query.groupBy(riskCase).getRawMany<RawRisk>(),
      noRows,
    );
    // El conteo sin prioridad sigue la misma decisión que las filas.
    const countWithoutPriority = await filterByRole(
      buildCountBaseQuery(),
      role,
      responsibleIds ?? [],
    ).getRawOne<RawCount>();
    const totalWithoutPriority = Number(countWithoutPriority?.total || 0);

    const totalsByRisk = rows.reduce<Record<string, number>>((acc, row) => {
      if (!row.riskLevel) {
        return acc;
      }

      acc[row.riskLevel] = Number(row.total || 0);
      return acc;
    }, {});

    const seriesData = RISK_LEVELS.map((item) => ({
      name: item.name,
      y: totalsByRisk[item.name] || 0,
      color: item.color,
    }));

    const totalWithPriority = seriesData.reduce((acc, item) => acc + item.y, 0);

    return {
      total: totalWithPriority,
      totalWithPriority,
      totalWithoutPriority,
      startDate,
      endDate,
      seriesData,
    };
  }

  async findAreasByFilters(
    manufacturingPlantId: number,
    startDate: string,
    endDate: string,
    areaIds?: number[],
    responsibleIds?: number[],
    mainTypeIds?: number[],
    states?: string[],
  ) {
    if (!manufacturingPlantId) {
      throw new BadRequestException('Selecciona una planta.');
    }

    if (!startDate || !endDate) {
      throw new BadRequestException(
        'Las fechas de inicio y fin son obligatorias',
      );
    }

    const parsedStartDate = this.parseDateFilter(
      startDate,
      'La fecha de inicio',
    );
    const parsedEndDate = this.parseDateFilter(
      endDate,
      'La fecha de fin',
      true,
    );

    if (parsedStartDate > parsedEndDate) {
      throw new BadRequestException(
        'La fecha de inicio no puede ser mayor a la fecha de fin',
      );
    }

    mainTypeIds = await this.resolveScopedMainTypeIds(mainTypeIds);

    const buildBaseQuery = () =>
      this.evidenceRepository
        .createQueryBuilder('evidence')
        .leftJoin('evidence.zone', 'zone')
        .leftJoin('zone.area', 'area')
        .select(`COALESCE(area.name, 'Sin zona')`, 'name')
        .addSelect('COUNT(*)', 'total')
        .where('evidence."manufacturingPlantId" = :manufacturingPlantId', {
          manufacturingPlantId,
        })
        .andWhere('evidence."createdAt" BETWEEN :startDate AND :endDate', {
          startDate: parsedStartDate,
          endDate: parsedEndDate,
        });

    const applyOptionalAreaFilter = (
      query: ReturnType<typeof buildBaseQuery>,
    ) => {
      if (areaIds && areaIds.length > 0) {
        query.andWhere('zone."areaId" IN (:...areaIds)', {
          areaIds,
        });
      }

      if (mainTypeIds && mainTypeIds.length > 0) {
        query.andWhere('evidence."mainTypeId" IN (:...mainTypeIds)', {
          mainTypeIds,
        });
      }

      if (states && states.length > 0) {
        query.andWhere('evidence.status IN (:...states)', { states });
      }

      return query;
    };

    let rows: { name: string; total: string }[] = [];

    rows = (
      await byResponsibleOrSupervisor(
        responsibleIds,
        () => applyOptionalAreaFilter(buildBaseQuery()),
        (query) =>
          query
            .groupBy('area.name')
            .getRawMany<{ name: string; total: string }>(),
        noRows,
      )
    ).result;

    const seriesData = rows
      .map((row) => ({
        name: row.name,
        y: Number(row.total),
      }))
      .sort((a, b) => b.y - a.y);

    const total = seriesData.reduce((acc, item) => acc + item.y, 0);

    return {
      total,
      startDate,
      endDate,
      seriesData,
    };
  }

  async findMainTypesByFilters(
    manufacturingPlantId: number,
    startDate: string,
    endDate: string,
    areaIds?: number[],
    responsibleIds?: number[],
    mainTypeIds?: number[],
    states?: string[],
  ) {
    if (!manufacturingPlantId) {
      throw new BadRequestException('Selecciona una planta.');
    }

    if (!startDate || !endDate) {
      throw new BadRequestException(
        'Las fechas de inicio y fin son obligatorias',
      );
    }

    const parsedStartDate = this.parseDateFilter(
      startDate,
      'La fecha de inicio',
    );
    const parsedEndDate = this.parseDateFilter(
      endDate,
      'La fecha de fin',
      true,
    );

    if (parsedStartDate > parsedEndDate) {
      throw new BadRequestException(
        'La fecha de inicio no puede ser mayor a la fecha de fin',
      );
    }

    mainTypeIds = await this.resolveScopedMainTypeIds(mainTypeIds);

    const buildBaseQuery = () =>
      this.evidenceRepository
        .createQueryBuilder('evidence')
        .leftJoin('evidence.zone', 'zone')
        .leftJoin('evidence.mainType', 'mainType')
        .select(`COALESCE(mainType.name, 'Sin clasificacion')`, 'name')
        .addSelect('COUNT(*)', 'total')
        .where('evidence."manufacturingPlantId" = :manufacturingPlantId', {
          manufacturingPlantId,
        })
        .andWhere('evidence."createdAt" BETWEEN :startDate AND :endDate', {
          startDate: parsedStartDate,
          endDate: parsedEndDate,
        });

    const applyOptionalFilters = (query: ReturnType<typeof buildBaseQuery>) => {
      if (areaIds && areaIds.length > 0) {
        query.andWhere('zone."areaId" IN (:...areaIds)', {
          areaIds,
        });
      }

      if (mainTypeIds && mainTypeIds.length > 0) {
        query.andWhere('evidence."mainTypeId" IN (:...mainTypeIds)', {
          mainTypeIds,
        });
      }

      if (states && states.length > 0) {
        query.andWhere('evidence.status IN (:...states)', { states });
      }

      return query;
    };

    let rows: { name: string; total: string }[] = [];

    rows = (
      await byResponsibleOrSupervisor(
        responsibleIds,
        () => applyOptionalFilters(buildBaseQuery()),
        (query) =>
          query
            .groupBy('mainType.name')
            .getRawMany<{ name: string; total: string }>(),
        noRows,
      )
    ).result;

    const seriesData = rows
      .map((row) => ({
        name: row.name,
        y: Number(row.total),
      }))
      .sort((a, b) => b.y - a.y);

    const total = seriesData.reduce((acc, item) => acc + item.y, 0);

    return {
      total,
      startDate,
      endDate,
      seriesData,
    };
  }

  async findHeatmapByFilters(
    manufacturingPlantId: number,
    startDate: string,
    endDate: string,
    areaIds?: number[],
    responsibleIds?: number[],
    mainTypeIds?: number[],
    states?: string[],
  ) {
    if (!manufacturingPlantId) {
      throw new BadRequestException('Selecciona una planta.');
    }

    if (!startDate || !endDate) {
      throw new BadRequestException(
        'Las fechas de inicio y fin son obligatorias',
      );
    }

    const parsedStartDate = this.parseDateFilter(
      startDate,
      'La fecha de inicio',
    );
    const parsedEndDate = this.parseDateFilter(
      endDate,
      'La fecha de fin',
      true,
    );

    if (parsedStartDate > parsedEndDate) {
      throw new BadRequestException(
        'La fecha de inicio no puede ser mayor a la fecha de fin',
      );
    }

    mainTypeIds = await this.resolveScopedMainTypeIds(mainTypeIds);

    const buildBaseQuery = () => {
      const query = this.evidenceRepository
        .createQueryBuilder('evidence')
        .leftJoin('evidence.zone', 'zone')
        .leftJoin('zone.area', 'area')
        .select('area.id', 'areaId')
        .addSelect(`COALESCE(area.name, 'Sin nombre')`, 'areaName')
        .addSelect('area."coordinateX"', 'x')
        .addSelect('area."coordinateY"', 'y')
        .addSelect('area."zoomLevel"', 'zoomLevel')
        .addSelect('COUNT(DISTINCT evidence.id)', 'total')
        .addSelect(
          `COUNT(DISTINCT CASE WHEN evidence.status = 'Abierto' THEN evidence.id END)`,
          'openCount',
        )
        .addSelect(
          `COUNT(DISTINCT CASE WHEN evidence.status = 'En progreso' THEN evidence.id END)`,
          'inProgressCount',
        )
        .addSelect(
          `COUNT(DISTINCT CASE WHEN evidence.status = 'Cerrado' THEN evidence.id END)`,
          'closedCount',
        )
        .addSelect(
          `COUNT(DISTINCT CASE WHEN evidence.status = 'Cancelado' THEN evidence.id END)`,
          'cancelledCount',
        )
        .where('evidence."manufacturingPlantId" = :manufacturingPlantId', {
          manufacturingPlantId,
        })
        .andWhere('evidence."createdAt" BETWEEN :startDate AND :endDate', {
          startDate: parsedStartDate,
          endDate: parsedEndDate,
        })
        .andWhere('area."coordinateX" IS NOT NULL')
        .andWhere('area."coordinateY" IS NOT NULL');

      if (areaIds && areaIds.length > 0) {
        query.andWhere('zone."areaId" IN (:...areaIds)', {
          areaIds,
        });
      }

      if (mainTypeIds && mainTypeIds.length > 0) {
        query.andWhere('evidence."mainTypeId" IN (:...mainTypeIds)', {
          mainTypeIds,
        });
      }

      if (states && states.length > 0) {
        query.andWhere('evidence.status IN (:...states)', { states });
      }

      return query
        .groupBy('area.id')
        .addGroupBy('area.name')
        .addGroupBy('area."coordinateX"')
        .addGroupBy('area."coordinateY"')
        .addGroupBy('area."zoomLevel"');
    };

    type RawPoint = {
      areaId: string;
      areaName: string;
      x: string;
      y: string;
      zoomLevel: string | null;
      total: string;
      openCount: string;
      inProgressCount: string;
      closedCount: string;
      cancelledCount: string;
    };

    // Los puntos y el resumen por estatus no dependen uno del otro: a la
    // vez (antes, el resumen esperaba a los puntos).
    const [{ result: rows }, statusByFilters] = await Promise.all([
      byResponsibleOrSupervisor(
        responsibleIds,
        () => buildBaseQuery(),
        (query) => query.getRawMany<RawPoint>(),
        noRows,
      ),
      this.findStatusByFilters(
        manufacturingPlantId,
        startDate,
        endDate,
        areaIds,
        responsibleIds,
        mainTypeIds,
        states,
      ),
    ]);

    const statusPriority = ['Abierto', 'En progreso', 'Cerrado', 'Cancelado'];

    const points = rows
      .map((row) => {
        const statusCounts = {
          Abierto: Number(row.openCount || 0),
          'En progreso': Number(row.inProgressCount || 0),
          Cerrado: Number(row.closedCount || 0),
          Cancelado: Number(row.cancelledCount || 0),
        };

        const dominantStatus = statusPriority.reduce((current, candidate) =>
          statusCounts[candidate] > statusCounts[current] ? candidate : current,
        );

        return {
          areaId: Number(row.areaId),
          areaName: row.areaName,
          x: Number(row.x),
          y: Number(row.y),
          zoomLevel: row.zoomLevel ? Number(row.zoomLevel) : null,
          value: Number(row.total),
          dominantStatus,
          statusCounts,
        };
      })
      .filter((item) => item.value > 0);

    const maxX = points.reduce((acc, item) => Math.max(acc, item.x), 0);
    const maxY = points.reduce((acc, item) => Math.max(acc, item.y), 0);
    const maxValue = points.reduce((acc, item) => Math.max(acc, item.value), 0);
    const totalEvidences = points.reduce((acc, item) => acc + item.value, 0);
    const totalOpenEvidencesWithCoordinates = points.reduce(
      (acc, item) => acc + item.statusCounts.Abierto,
      0,
    );

    const totalOpenEvidences =
      statusByFilters.seriesData.find((item) => item.name === 'Abierto')?.y ||
      0;

    return {
      startDate,
      endDate,
      totalAreas: points.length,
      totalEvidences,
      totalOpenEvidences,
      totalOpenEvidencesWithCoordinates,
      maxX,
      maxY,
      maxValue,
      points,
    };
  }

  async findResponsiblesByFilters(
    manufacturingPlantId: number,
    startDate: string,
    endDate: string,
    areaIds: number[],
    mainTypeIds?: number[],
    states?: string[],
  ) {
    if (!manufacturingPlantId) {
      throw new BadRequestException('Selecciona una planta.');
    }

    if (!startDate || !endDate) {
      throw new BadRequestException(
        'Las fechas de inicio y fin son obligatorias',
      );
    }

    if (!areaIds || areaIds.length === 0) {
      throw new BadRequestException('areaIds es obligatorio');
    }

    const parsedStartDate = this.parseDateFilter(
      startDate,
      'La fecha de inicio',
    );
    const parsedEndDate = this.parseDateFilter(
      endDate,
      'La fecha de fin',
      true,
    );

    if (parsedStartDate > parsedEndDate) {
      throw new BadRequestException(
        'La fecha de inicio no puede ser mayor a la fecha de fin',
      );
    }

    mainTypeIds = await this.resolveScopedMainTypeIds(mainTypeIds);

    const buildBaseQuery = () => {
      const query = this.evidenceRepository
        .createQueryBuilder('evidence')
        .leftJoin('evidence.zone', 'zone')
        .select('u.id', 'id')
        .addSelect('u.name', 'name')
        .where('evidence."manufacturingPlantId" = :manufacturingPlantId', {
          manufacturingPlantId,
        })
        .andWhere('evidence."createdAt" BETWEEN :startDate AND :endDate', {
          startDate: parsedStartDate,
          endDate: parsedEndDate,
        })
        .andWhere('zone."areaId" IN (:...areaIds)', {
          areaIds,
        });

      if (mainTypeIds && mainTypeIds.length > 0) {
        query.andWhere('evidence."mainTypeId" IN (:...mainTypeIds)', {
          mainTypeIds,
        });
      }

      if (states && states.length > 0) {
        query.andWhere('evidence.status IN (:...states)', { states });
      }

      return query;
    };

    const responsiblesRows = await buildBaseQuery()
      .innerJoin(
        'evidence_responsibles_user',
        'eru',
        'eru."evidenceId" = evidence.id',
      )
      .innerJoin(User, 'u', 'u.id = eru."userId" AND u."isActive" = true')
      .groupBy('u.id')
      .addGroupBy('u.name')
      .orderBy('u.name', 'ASC')
      .getRawMany<{ id: string; name: string }>();

    if (responsiblesRows.length > 0) {
      return responsiblesRows.map((item) => ({
        id: Number(item.id),
        name: item.name,
      }));
    }

    const supervisorsRows = await buildBaseQuery()
      .innerJoin(
        'evidence_supervisors_user',
        'esu',
        'esu."evidenceId" = evidence.id',
      )
      .innerJoin(User, 'u', 'u.id = esu."userId" AND u."isActive" = true')
      .groupBy('u.id')
      .addGroupBy('u.name')
      .orderBy('u.name', 'ASC')
      .getRawMany<{ id: string; name: string }>();

    return supervisorsRows.map((item) => ({
      id: Number(item.id),
      name: item.name,
    }));
  }

  async findAssignedResponsiblesByFilters(
    manufacturingPlantId: number,
    startDate: string,
    endDate: string,
    areaIds?: number[],
    responsibleIds?: number[],
    mainTypeIds?: number[],
    states?: string[],
  ) {
    if (!manufacturingPlantId) {
      throw new BadRequestException('Selecciona una planta.');
    }

    if (!startDate || !endDate) {
      throw new BadRequestException(
        'Las fechas de inicio y fin son obligatorias',
      );
    }

    const parsedStartDate = this.parseDateFilter(
      startDate,
      'La fecha de inicio',
    );
    const parsedEndDate = this.parseDateFilter(
      endDate,
      'La fecha de fin',
      true,
    );

    if (parsedStartDate > parsedEndDate) {
      throw new BadRequestException(
        'La fecha de inicio no puede ser mayor a la fecha de fin',
      );
    }

    mainTypeIds = await this.resolveScopedMainTypeIds(mainTypeIds);

    const statusOrder = ['Abierto', 'En progreso', 'Cerrado', 'Cancelado'];

    const addBaseFilters = (
      query: SelectQueryBuilder<Evidence>,
      userTableAlias: 'eru' | 'esu',
    ) => {
      query
        .where('evidence."manufacturingPlantId" = :manufacturingPlantId', {
          manufacturingPlantId,
        })
        .andWhere('evidence."createdAt" BETWEEN :startDate AND :endDate', {
          startDate: parsedStartDate,
          endDate: parsedEndDate,
        });

      if (areaIds && areaIds.length > 0) {
        query
          .leftJoin('evidence.zone', 'zone')
          .andWhere('zone."areaId" IN (:...areaIds)', {
            areaIds,
          });
      }

      if (responsibleIds && responsibleIds.length > 0) {
        query.andWhere(`${userTableAlias}."userId" IN (:...responsibleIds)`, {
          responsibleIds,
        });
      }

      if (mainTypeIds && mainTypeIds.length > 0) {
        query.andWhere('evidence."mainTypeId" IN (:...mainTypeIds)', {
          mainTypeIds,
        });
      }

      if (states && states.length > 0) {
        query.andWhere('evidence.status IN (:...states)', { states });
      }
    };

    const buildResponsiblesQuery = () => {
      const query = this.evidenceRepository
        .createQueryBuilder('evidence')
        .innerJoin(
          'evidence_responsibles_user',
          'eru',
          'eru."evidenceId" = evidence.id',
        )
        .innerJoin(User, 'u', 'u.id = eru."userId" AND u."isActive" = true')
        .select('u.id', 'responsibleId')
        .addSelect('u.name', 'responsibleName')
        .addSelect('evidence.status', 'status')
        .addSelect('COUNT(DISTINCT evidence.id)', 'total');

      addBaseFilters(query, 'eru');

      return query
        .groupBy('u.id')
        .addGroupBy('u.name')
        .addGroupBy('evidence.status');
    };

    const buildSupervisorsQuery = (fallbackOnlyWhenNoResponsibles: boolean) => {
      const query = this.evidenceRepository
        .createQueryBuilder('evidence')
        .innerJoin(
          'evidence_supervisors_user',
          'esu',
          'esu."evidenceId" = evidence.id',
        )
        .innerJoin(User, 'u', 'u.id = esu."userId" AND u."isActive" = true')
        .select('u.id', 'responsibleId')
        .addSelect('u.name', 'responsibleName')
        .addSelect('evidence.status', 'status')
        .addSelect('COUNT(DISTINCT evidence.id)', 'total');

      addBaseFilters(query, 'esu');

      if (fallbackOnlyWhenNoResponsibles) {
        query.andWhere(
          'NOT EXISTS (SELECT 1 FROM evidence_responsibles_user eru2 WHERE eru2."evidenceId" = evidence.id)',
        );
      }

      return query
        .groupBy('u.id')
        .addGroupBy('u.name')
        .addGroupBy('evidence.status');
    };

    type RawRow = {
      responsibleId: string;
      responsibleName: string;
      status: string;
      total: string;
    };

    let rows: RawRow[] = [];

    if (responsibleIds && responsibleIds.length > 0) {
      const rowsByResponsibles =
        await buildResponsiblesQuery().getRawMany<RawRow>();

      rows =
        rowsByResponsibles.length > 0
          ? rowsByResponsibles
          : await buildSupervisorsQuery(false).getRawMany<RawRow>();
    } else {
      // Responsables y supervisores son independientes: a la vez.
      const [responsiblesRows, supervisorsRows] = await Promise.all([
        buildResponsiblesQuery().getRawMany<RawRow>(),
        buildSupervisorsQuery(true).getRawMany<RawRow>(),
      ]);

      rows = [...responsiblesRows, ...supervisorsRows];
    }

    const responsiblesById = new Map<
      number,
      {
        name: string;
        statusCounts: Record<string, number>;
      }
    >();

    for (const row of rows) {
      const userId = Number(row.responsibleId);
      const status = row.status;
      const total = Number(row.total);

      if (!responsiblesById.has(userId)) {
        responsiblesById.set(userId, {
          name: row.responsibleName,
          statusCounts: {
            Abierto: 0,
            'En progreso': 0,
            Cerrado: 0,
            Cancelado: 0,
          },
        });
      }

      // Siempre existe: se crea arriba si faltaba.
      const responsibleData = responsiblesById.get(userId);
      responsibleData.statusCounts[status] =
        (responsibleData.statusCounts[status] || 0) + total;
    }

    const sortedResponsibles = Array.from(responsiblesById.entries())
      .map(([id, data]) => ({
        id,
        ...data,
      }))
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }) ||
          a.id - b.id,
      );

    const categories = sortedResponsibles.map((item) => item.name);

    const series = statusOrder
      .map((status) => ({
        name: status,
        data: sortedResponsibles.map(
          (responsible) => responsible.statusCounts[status] || 0,
        ),
      }))
      .filter((item) => item.data.some((value) => value > 0));

    const total = series.reduce(
      (acc, seriesItem) =>
        acc + seriesItem.data.reduce((sum, value) => sum + value, 0),
      0,
    );

    return {
      total,
      startDate,
      endDate,
      categories,
      series,
    };
  }

  async findHistoricalByMonth() {
    // Solo las plantas del usuario (antes incluía todas las plantas).
    const plantIds = this.findManufacturingPlantsIdsCurrentUser();

    const minEvidenceDateResult = plantIds.length
      ? await this.evidenceRepository
          .createQueryBuilder('evidence')
          .select('MIN(evidence."createdAt")', 'minDate')
          .where('evidence."manufacturingPlantId" IN (:...plantIds)', {
            plantIds,
          })
          .getRawOne<{ minDate: Date | string | null }>()
      : null;

    if (!minEvidenceDateResult?.minDate) {
      return {
        startMonth: '',
        endMonth: '',
        categories: [],
        series: [],
      };
    }

    const minDate = new Date(minEvidenceDateResult.minDate);
    const currentDate = new Date();

    const startMonthDate = new Date(
      minDate.getFullYear(),
      minDate.getMonth(),
      1,
    );
    const endMonthDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1,
    );

    const categories: string[] = [];
    const monthIndexByKey = new Map<string, number>();

    for (
      let month = new Date(startMonthDate);
      month <= endMonthDate;
      month = new Date(month.getFullYear(), month.getMonth() + 1, 1)
    ) {
      const year = month.getFullYear();
      const monthNumber = String(month.getMonth() + 1).padStart(2, '0');
      const monthKey = `${year}-${monthNumber}`;
      const index = categories.length;

      categories.push(monthKey);
      monthIndexByKey.set(monthKey, index);
    }

    const monthTruncExpression = `DATE_TRUNC('month', evidence."createdAt")`;

    const rows = await this.evidenceRepository
      .createQueryBuilder('evidence')
      .leftJoin('evidence.manufacturingPlant', 'plant')
      .select(`TO_CHAR(${monthTruncExpression}, 'YYYY-MM')`, 'monthKey')
      .addSelect('plant.id', 'plantId')
      .addSelect('plant.name', 'plantName')
      .addSelect('COUNT(*)', 'total')
      .where('evidence."manufacturingPlantId" IN (:...plantIds)', { plantIds })
      .andWhere('evidence."createdAt" BETWEEN :startDate AND :endDate', {
        startDate: startMonthDate,
        endDate: new Date(
          endMonthDate.getFullYear(),
          endMonthDate.getMonth() + 1,
          0,
          23,
          59,
          59,
          999,
        ),
      })
      .groupBy(monthTruncExpression)
      .addGroupBy('plant.id')
      .addGroupBy('plant.name')
      .orderBy(monthTruncExpression, 'ASC')
      .addOrderBy('plant.name', 'ASC')
      .getRawMany<{
        monthKey: string;
        plantId: string;
        plantName: string;
        total: string;
      }>();

    const seriesMap = new Map<
      string,
      {
        name: string;
        data: number[];
      }
    >();

    for (const row of rows) {
      const plantId = String(row.plantId);
      const seriesItem = seriesMap.get(plantId) || {
        name: row.plantName,
        data: Array(categories.length).fill(0),
      };

      const monthIndex = monthIndexByKey.get(row.monthKey);

      if (monthIndex !== undefined) {
        seriesItem.data[monthIndex] = Number(row.total);
      }

      seriesMap.set(plantId, seriesItem);
    }

    const series = Array.from(seriesMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
    );

    return {
      // La ventana siempre tiene al menos el mes actual.
      startMonth: categories[0],
      endMonth: categories.at(-1),
      categories,
      series,
    };
  }

  async findSankeyByFilters(
    manufacturingPlantId: number,
    startDate: string,
    endDate: string,
    areaIds?: number[],
    responsibleIds?: number[],
    mainTypeIds?: number[],
    states?: string[],
  ) {
    if (!manufacturingPlantId) {
      throw new BadRequestException('Selecciona una planta.');
    }

    if (!startDate || !endDate) {
      throw new BadRequestException(
        'Las fechas de inicio y fin son obligatorias',
      );
    }

    const parsedStartDate = this.parseDateFilter(
      startDate,
      'La fecha de inicio',
    );
    const parsedEndDate = this.parseDateFilter(
      endDate,
      'La fecha de fin',
      true,
    );

    if (parsedStartDate > parsedEndDate) {
      throw new BadRequestException(
        'La fecha de inicio no puede ser mayor a la fecha de fin',
      );
    }

    mainTypeIds = await this.resolveScopedMainTypeIds(mainTypeIds);

    const buildBaseQuery = () => {
      const query = this.evidenceRepository
        .createQueryBuilder('evidence')
        .leftJoin('evidence.zone', 'zone')
        .leftJoin('zone.area', 'area')
        .select(`COALESCE(area.name, 'Sin zona')`, 'areaName')
        .addSelect('evidence.status', 'status')
        .addSelect('COUNT(*)', 'total')
        .where('evidence."manufacturingPlantId" = :manufacturingPlantId', {
          manufacturingPlantId,
        })
        .andWhere('evidence."createdAt" BETWEEN :startDate AND :endDate', {
          startDate: parsedStartDate,
          endDate: parsedEndDate,
        });

      if (areaIds && areaIds.length > 0) {
        query.andWhere('zone."areaId" IN (:...areaIds)', {
          areaIds,
        });
      }

      if (mainTypeIds && mainTypeIds.length > 0) {
        query.andWhere('evidence."mainTypeId" IN (:...mainTypeIds)', {
          mainTypeIds,
        });
      }

      if (states && states.length > 0) {
        query.andWhere('evidence.status IN (:...states)', { states });
      }

      return query;
    };

    type RawRow = {
      areaName: string;
      status: string;
      total: string;
    };

    let rows: RawRow[] = [];

    rows = (
      await byResponsibleOrSupervisor(
        responsibleIds,
        () => buildBaseQuery(),
        (query) =>
          query
            .groupBy('area.name')
            .addGroupBy('evidence.status')
            .getRawMany<RawRow>(),
        noRows,
      )
    ).result;

    const statusOrder = ['Abierto', 'En progreso', 'Cerrado', 'Cancelado'];

    const areaTotals = new Map<string, number>();

    for (const row of rows) {
      const current = areaTotals.get(row.areaName) || 0;
      areaTotals.set(row.areaName, current + Number(row.total));
    }

    const orderedAreas = Array.from(areaTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    const areaNodeId = (areaName: string) => `area:${areaName}`;
    const statusNodeId = (statusName: string) => `status:${statusName}`;

    const links = rows
      .map((row) => ({
        from: areaNodeId(row.areaName),
        to: statusNodeId(row.status),
        weight: Number(row.total),
      }))
      .filter((item) => item.weight > 0)
      .sort((a, b) => b.weight - a.weight);

    const usedAreaNodeIds = new Set(links.map((item) => item.from));
    const usedStatusNodeIds = new Set(links.map((item) => item.to));

    const nodes = [
      ...orderedAreas
        .filter((areaName) => usedAreaNodeIds.has(areaNodeId(areaName)))
        .map((areaName) => ({
          id: areaNodeId(areaName),
          name: areaName,
          column: 0,
        })),
      ...statusOrder
        .filter((statusName) => usedStatusNodeIds.has(statusNodeId(statusName)))
        .map((statusName) => ({
          id: statusNodeId(statusName),
          name: statusName,
          column: 1,
        })),
    ];

    const total = links.reduce((acc, item) => acc + item.weight, 0);

    return {
      total,
      startDate,
      endDate,
      nodes,
      links,
    };
  }

  async findPackedBubbleByFilters(
    manufacturingPlantId: number,
    startDate: string,
    endDate: string,
    areaIds?: number[],
    responsibleIds?: number[],
    mainTypeIds?: number[],
    states?: string[],
  ) {
    if (!manufacturingPlantId) {
      throw new BadRequestException('Selecciona una planta.');
    }

    if (!startDate || !endDate) {
      throw new BadRequestException(
        'Las fechas de inicio y fin son obligatorias',
      );
    }

    const parsedStartDate = this.parseDateFilter(
      startDate,
      'La fecha de inicio',
    );
    const parsedEndDate = this.parseDateFilter(
      endDate,
      'La fecha de fin',
      true,
    );

    if (parsedStartDate > parsedEndDate) {
      throw new BadRequestException(
        'La fecha de inicio no puede ser mayor a la fecha de fin',
      );
    }

    mainTypeIds = await this.resolveScopedMainTypeIds(mainTypeIds);

    const buildBaseQuery = () => {
      const query = this.evidenceRepository
        .createQueryBuilder('evidence')
        .leftJoin('evidence.zone', 'zone')
        .leftJoin('zone.area', 'area')
        .select('evidence.status', 'status')
        .addSelect(`COALESCE(area.name, 'Sin zona')`, 'areaName')
        .addSelect('COUNT(*)', 'total')
        .where('evidence."manufacturingPlantId" = :manufacturingPlantId', {
          manufacturingPlantId,
        })
        .andWhere('evidence."createdAt" BETWEEN :startDate AND :endDate', {
          startDate: parsedStartDate,
          endDate: parsedEndDate,
        });

      if (areaIds && areaIds.length > 0) {
        query.andWhere('zone."areaId" IN (:...areaIds)', {
          areaIds,
        });
      }

      if (mainTypeIds && mainTypeIds.length > 0) {
        query.andWhere('evidence."mainTypeId" IN (:...mainTypeIds)', {
          mainTypeIds,
        });
      }

      if (states && states.length > 0) {
        query.andWhere('evidence.status IN (:...states)', { states });
      }

      return query;
    };

    type RawRow = {
      status: string;
      areaName: string;
      total: string;
    };

    let rows: RawRow[] = [];

    rows = (
      await byResponsibleOrSupervisor(
        responsibleIds,
        () => buildBaseQuery(),
        (query) =>
          query
            .groupBy('evidence.status')
            .addGroupBy('area.name')
            .getRawMany<RawRow>(),
        noRows,
      )
    ).result;

    const statusOrder = ['Abierto', 'En progreso', 'Cerrado', 'Cancelado'];

    const groupedByStatus = new Map<
      string,
      { name: string; value: number }[]
    >();

    for (const row of rows) {
      const list = groupedByStatus.get(row.status) || [];

      list.push({
        name: row.areaName,
        value: Number(row.total),
      });

      groupedByStatus.set(row.status, list);
    }

    const series = statusOrder
      .map((statusName) => {
        const data = (groupedByStatus.get(statusName) || [])
          .filter((item) => item.value > 0)
          .sort((a, b) => b.value - a.value);

        return {
          name: statusName,
          data,
        };
      })
      .filter((item) => item.data.length > 0);

    const total = series.reduce(
      (acc, item) =>
        acc + item.data.reduce((partial, point) => partial + point.value, 0),
      0,
    );

    return {
      total,
      startDate,
      endDate,
      series,
    };
  }

  async findSolidGaugeKpiByFilters(
    manufacturingPlantId: number,
    startDate: string,
    endDate: string,
    areaIds?: number[],
    responsibleIds?: number[],
    mainTypeIds?: number[],
    states?: string[],
  ) {
    if (!manufacturingPlantId) {
      throw new BadRequestException('Selecciona una planta.');
    }

    if (!startDate || !endDate) {
      throw new BadRequestException(
        'Las fechas de inicio y fin son obligatorias',
      );
    }

    const parsedStartDate = this.parseDateFilter(
      startDate,
      'La fecha de inicio',
    );
    const parsedEndDate = this.parseDateFilter(
      endDate,
      'La fecha de fin',
      true,
    );

    if (parsedStartDate > parsedEndDate) {
      throw new BadRequestException(
        'La fecha de inicio no puede ser mayor a la fecha de fin',
      );
    }

    mainTypeIds = await this.resolveScopedMainTypeIds(mainTypeIds);

    type KpiRawRow = {
      total: string;
      closed: string;
      backlogActive: string;
      avgResolutionDays: string | null;
    };

    const buildKpiQuery = () => {
      const query = this.evidenceRepository
        .createQueryBuilder('evidence')
        .leftJoin('evidence.zone', 'zone')
        .select('COUNT(*)', 'total')
        .addSelect(
          `COUNT(*) FILTER (WHERE evidence.status = 'Cerrado')`,
          'closed',
        )
        .addSelect(
          `COUNT(*) FILTER (WHERE evidence.status IN ('Abierto', 'En progreso'))`,
          'backlogActive',
        )
        .addSelect(
          `AVG(EXTRACT(EPOCH FROM (COALESCE(evidence."solutionDate", evidence."updatedAt") - evidence."createdAt")) / 86400.0) FILTER (WHERE evidence.status = 'Cerrado')`,
          'avgResolutionDays',
        )
        .where('evidence."manufacturingPlantId" = :manufacturingPlantId', {
          manufacturingPlantId,
        })
        .andWhere('evidence."createdAt" BETWEEN :startDate AND :endDate', {
          startDate: parsedStartDate,
          endDate: parsedEndDate,
        });

      if (areaIds && areaIds.length > 0) {
        query.andWhere('zone."areaId" IN (:...areaIds)', {
          areaIds,
        });
      }

      if (mainTypeIds && mainTypeIds.length > 0) {
        query.andWhere('evidence."mainTypeId" IN (:...mainTypeIds)', {
          mainTypeIds,
        });
      }

      if (states && states.length > 0) {
        query.andWhere('evidence.status IN (:...states)', { states });
      }

      return query;
    };

    const { result: rawRow } = await byResponsibleOrSupervisor(
      responsibleIds,
      buildKpiQuery,
      (query) => query.getRawOne<KpiRawRow>(),
      zeroTotal,
    );

    const total = Number(rawRow?.total || 0);
    const closed = Number(rawRow?.closed || 0);
    const backlogActive = Number(rawRow?.backlogActive || 0);
    const avgResolutionDays = Number(rawRow?.avgResolutionDays || 0);
    const closurePercentage =
      total > 0 ? Number(((closed / total) * 100).toFixed(2)) : 0;

    return {
      total,
      startDate,
      endDate,
      closurePercentage,
      avgResolutionDays: Number(avgResolutionDays.toFixed(2)),
      backlogActive,
    };
  }

  async findAreaRangeLineByFilters(
    manufacturingPlantId: number,
    startDate: string,
    endDate: string,
    areaIds?: number[],
    responsibleIds?: number[],
    mainTypeIds?: number[],
    states?: string[],
  ) {
    if (!manufacturingPlantId) {
      throw new BadRequestException('Selecciona una planta.');
    }

    if (!startDate || !endDate) {
      throw new BadRequestException(
        'Las fechas de inicio y fin son obligatorias',
      );
    }

    const parsedStartDate = this.parseDateFilter(
      startDate,
      'La fecha de inicio',
    );
    const parsedEndDate = this.parseDateFilter(
      endDate,
      'La fecha de fin',
      true,
    );

    if (parsedStartDate > parsedEndDate) {
      throw new BadRequestException(
        'La fecha de inicio no puede ser mayor a la fecha de fin',
      );
    }

    mainTypeIds = await this.resolveScopedMainTypeIds(mainTypeIds);

    type RawRow = {
      monthKey: string;
      total: string;
    };

    const monthTruncExpression = `DATE_TRUNC('month', evidence."createdAt")`;

    const buildBaseQuery = () => {
      const query = this.evidenceRepository
        .createQueryBuilder('evidence')
        .leftJoin('evidence.zone', 'zone')
        .select(`TO_CHAR(${monthTruncExpression}, 'YYYY-MM')`, 'monthKey')
        .addSelect('COUNT(*)', 'total')
        .where('evidence."manufacturingPlantId" = :manufacturingPlantId', {
          manufacturingPlantId,
        })
        .andWhere('evidence."createdAt" BETWEEN :startDate AND :endDate', {
          startDate: parsedStartDate,
          endDate: parsedEndDate,
        });

      if (areaIds && areaIds.length > 0) {
        query.andWhere('zone."areaId" IN (:...areaIds)', {
          areaIds,
        });
      }

      if (mainTypeIds && mainTypeIds.length > 0) {
        query.andWhere('evidence."mainTypeId" IN (:...mainTypeIds)', {
          mainTypeIds,
        });
      }

      if (states && states.length > 0) {
        query.andWhere('evidence.status IN (:...states)', { states });
      }

      return query;
    };

    let rows: RawRow[] = [];

    rows = (
      await byResponsibleOrSupervisor(
        responsibleIds,
        () => buildBaseQuery(),
        (query) =>
          query
            .groupBy(monthTruncExpression)
            .orderBy(monthTruncExpression, 'ASC')
            .getRawMany<RawRow>(),
        noRows,
      )
    ).result;

    const startMonthDate = new Date(
      parsedStartDate.getFullYear(),
      parsedStartDate.getMonth(),
      1,
    );
    const endMonthDate = new Date(
      parsedEndDate.getFullYear(),
      parsedEndDate.getMonth(),
      1,
    );

    const historicalCategories: string[] = [];

    for (
      let month = new Date(startMonthDate);
      month <= endMonthDate;
      month = new Date(month.getFullYear(), month.getMonth() + 1, 1)
    ) {
      const year = month.getFullYear();
      const monthNumber = String(month.getMonth() + 1).padStart(2, '0');
      historicalCategories.push(`${year}-${monthNumber}`);
    }

    const totalsByMonth = new Map<string, number>();
    rows.forEach((row) => {
      totalsByMonth.set(row.monthKey, Number(row.total));
    });

    const actualData = historicalCategories.map(
      (monthKey) => totalsByMonth.get(monthKey) || 0,
    );

    const forecastHorizonMonths = 3;
    const forecastCategories: string[] = [];
    const forecastDataOnly: number[] = [];

    const wmaWeightsNewestFirst = [0.4, 0.3, 0.2, 0.1];
    const valuesForForecast = [...actualData];

    const getNextWmaValue = () => {
      const availablePoints = Math.min(
        valuesForForecast.length,
        wmaWeightsNewestFirst.length,
      );

      // Siempre hay al menos un mes histórico (inicio <= fin).
      let weightedSum = 0;
      let totalWeight = 0;

      for (let i = 0; i < availablePoints; i++) {
        const value = valuesForForecast[valuesForForecast.length - 1 - i];
        const weight = wmaWeightsNewestFirst[i];
        weightedSum += value * weight;
        totalWeight += weight;
      }

      return weightedSum / totalWeight;
    };

    let monthCursor = new Date(endMonthDate);
    for (let i = 1; i <= forecastHorizonMonths; i++) {
      monthCursor = new Date(
        monthCursor.getFullYear(),
        monthCursor.getMonth() + 1,
        1,
      );

      const year = monthCursor.getFullYear();
      const monthNumber = String(monthCursor.getMonth() + 1).padStart(2, '0');
      forecastCategories.push(`${year}-${monthNumber}`);

      const projection = getNextWmaValue();
      const roundedProjection = Math.max(0, Math.round(projection));

      forecastDataOnly.push(roundedProjection);
      valuesForForecast.push(roundedProjection);
    }

    const categories = [...historicalCategories, ...forecastCategories];

    const actualSeries = [
      ...actualData,
      ...Array(forecastHorizonMonths).fill(null),
    ];

    const forecastSeries = [
      ...Array(historicalCategories.length - 1).fill(null),
      actualData[historicalCategories.length - 1],
      ...forecastDataOnly,
    ];

    const windowForVolatility = actualData.slice(-6);
    const mean =
      windowForVolatility.reduce((sum, value) => sum + value, 0) /
      windowForVolatility.length;

    const variance =
      windowForVolatility.length > 1
        ? windowForVolatility.reduce(
            (sum, value) => sum + (value - mean) * (value - mean),
            0,
          ) /
          (windowForVolatility.length - 1)
        : 0;

    const sigma = Math.max(1, Math.sqrt(variance));
    const z80 = 1.2816;

    const rangeSeries: Array<[number, number] | null> = [
      ...Array(historicalCategories.length - 1).fill(null),
      [
        actualData[historicalCategories.length - 1],
        actualData[historicalCategories.length - 1],
      ],
    ];

    forecastDataOnly.forEach((value, index) => {
      const horizon = index + 1;
      const scale = Math.sqrt(horizon);
      const margin = z80 * sigma * scale;

      const low = Math.max(0, Math.round(value - margin));
      const high = Math.max(0, Math.round(value + margin));

      rangeSeries.push([low, high]);
    });

    return {
      startDate,
      endDate,
      categories,
      actualSeries,
      forecastSeries,
      rangeSeries,
      forecastHorizonMonths,
    };
  }

  async findAllZones() {
    return DashboardService.plantShareChart(
      await this.countEvidencesByPlant('zone'),
    );
  }

  async findAllMainTypes() {
    const plants = await this.countEvidencesByPlant('mainType');
    const totalEvidences = plants.reduce((acc, plant) => acc + plant.total, 0);
    // El id del drilldown lleva el total: así lo enlaza la gráfica.
    const fullNameOf = (plant: PlantEvidenceCount) =>
      `${plant.name} (${plant.total})`;

    return {
      series: [
        {
          name: 'Plantas',
          colorByPoint: true,
          data: plants.map((plant) => ({
            name: fullNameOf(plant),
            y: DashboardService.percentage(plant.total, totalEvidences),
            drilldown: fullNameOf(plant),
          })),
        },
      ],
      drilldown: {
        breadcrumbs: {
          position: {
            align: 'right',
          },
        },
        series: plants.map((plant) => ({
          name: plant.name,
          id: fullNameOf(plant),
          data: plant.groups.map(([label, total]) => [
            `${label} (${total})`,
            DashboardService.percentage(total, plant.total),
          ]),
        })),
      },
    };
  }

  async findAllEvidencesByMonth(year?: number) {
    const manufacturingPlantsIds = this.findManufacturingPlantsIdsCurrentUser();

    // $1 año (null = el actual) · $2 plantas del usuario. Valores como
    // parámetros, nunca dentro del SQL.
    const params = [year ?? null, manufacturingPlantsIds];
    const whereDefault = `
      evidence."isActive" = TRUE
      AND evidence.status != 'Cancelado'
      AND date_part( 'year', evidence."createdAt" ) =
        COALESCE( $1::double precision, date_part( 'year', CURRENT_DATE ) )
      AND evidence."manufacturingPlantId" = ANY( $2::int[] )
    `;

    const categories: { mon: string }[] = await this.queryWithParams(
      `
      SELECT
        to_char( evidence."createdAt", 'Mon' ) AS mon
      FROM
        evidence
      WHERE
        ${whereDefault}
      GROUP BY
        mon
      ORDER BY
        MIN ( evidence."createdAt" )
      ASC
    `,
      params,
    );

    // Todos los meses en una consulta (antes, una consulta por mes).
    const rows: { mon: string; name: string; total: string }[] =
      await this.queryWithParams(
        `
        SELECT EXTRACT
          ( YEAR FROM evidence."createdAt" ) AS yyyy,
          to_char( evidence."createdAt", 'Mon' ) AS mon,
          manufacturing_plant."name",
          COUNT ( * ) AS total
        FROM
          evidence
          INNER JOIN manufacturing_plant ON manufacturing_plant."id" = evidence."manufacturingPlantId"
          AND manufacturing_plant."isActive" = true
        WHERE
          ${whereDefault}
        GROUP BY
          1,
          2,
          evidence."manufacturingPlantId",
          manufacturing_plant."name"
        ORDER BY
          MIN ( evidence."createdAt" ) ASC
      `,
        params,
      );

    const months = {
      Jan: 'Ene',
      Feb: 'Feb',
      Mar: 'Mar',
      Apr: 'Abr',
      May: 'May',
      Jun: 'Jun',
      Jul: 'Jul',
      Aug: 'Ago',
      Sep: 'Sep',
      Oct: 'Oct',
      Nov: 'Nov',
      Dec: 'Dic',
    };

    // Filas de cada mes, en el orden de los meses (y dentro, el de la base).
    const manufacturingByMonth = categories.map((category) =>
      rows
        .filter((item) => item.mon === category.mon)
        .map((item) => ({
          ...item,
          mon: months[item.mon] || item.mon,
        })),
    );

    const manufacturingPlants = [
      ...new Set(
        manufacturingByMonth.reduce((acc, item) => {
          const plants = item.map((item) => item.name);
          return [...acc, ...plants];
        }, []),
      ),
    ];

    const categoriesFormatted = categories.map((item) => {
      return months[item.mon] || item.mon;
    });

    return {
      series: manufacturingPlants.map((plant) => {
        return {
          name: plant,
          data: categoriesFormatted.map((mon) => {
            const data = manufacturingByMonth.filter((item) => {
              return item.some((e) => e.mon === mon && e.name === plant);
            });

            if (data.length === 0) {
              return 0;
            }

            const currentData = data[0].find((item) => item.name === plant);

            return Number(currentData.total);
          }),
        };
      }),
      categories: categoriesFormatted,
    };
  }

  /**
   * Índice de accidentes por mes del año pedido (sin año, el actual). La
   * tabla accident_rate no tiene planta: son datos de toda la empresa.
   * Antes el año se ignoraba (el filtro estaba comentado) y se mezclaban
   * todos los años.
   */
  async findAllAccidentsByMonth(year?: number) {
    return this.queryWithParams(
      `
      SELECT
        date_part( 'month', ar.capture_date ) AS mes,
        date_part( 'year', ar.capture_date ) AS anio,
        CAST(SUM(ar.number_of_employees) AS float) AS numberOfEmployees,
        CAST(SUM(ar.number_of_accidents) AS float) AS accidentes
      FROM
        accident_rate AS ar
      WHERE
        date_part( 'year', ar.capture_date ) =
          COALESCE( $1::double precision, date_part( 'year', CURRENT_DATE ) )
      GROUP BY
        date_part( 'year', ar.capture_date ), date_part( 'month', ar.capture_date )
      ORDER BY
        date_part( 'month', ar.capture_date ) DESC
    `,
      [year ?? null],
    );
  }

  async findTopUsersByPlant() {
    const manufacturingPlantsIds = this.findManufacturingPlantsIdsCurrentUser();

    const result = await this.queryWithParams(
      `
      SELECT
        evidence."userId",
        "user"."name" AS username,
        evidence."manufacturingPlantId",
        manufacturing_plant."name" AS manufacturingplantname,
        COUNT ( * ) AS total 
      FROM
        evidence
        INNER JOIN "user" ON "user"."id" = evidence."userId" 
        AND "user"."isActive" = TRUE 
        INNER JOIN manufacturing_plant ON manufacturing_plant."id" = evidence."manufacturingPlantId" 
        AND manufacturing_plant."isActive" = TRUE 
      WHERE
        evidence."isActive" = TRUE 
        AND manufacturing_plant."id" = ANY( $1::int[] )
      GROUP BY
        evidence."userId",
        "user"."name",
        evidence."manufacturingPlantId",
        manufacturing_plant."name" 
      ORDER BY
        manufacturingplantname ASC,
        total DESC
    `,
      [manufacturingPlantsIds],
    );

    const manufacturingPlants = [
      ...new Set(result.map((item) => item.manufacturingplantname)),
    ];

    return {
      data: manufacturingPlants.map((plant) => {
        const data = result.filter(
          (item) => item.manufacturingplantname === plant,
        );

        return {
          name: plant,
          data,
        };
      }),
    };
  }

  async findOpenVsClosed() {
    const manufacturingPlantsIds = this.findManufacturingPlantsIdsCurrentUser();

    const result = await this.queryWithParams(
      `
      SELECT
        COUNT ( CASE WHEN evidence."status" = 'Abierto' THEN 1 END ) AS open,
        COUNT ( CASE WHEN evidence."status" = 'Cerrado' THEN 1 END ) AS closed,
        manufacturing_plant."name" AS manufacturingplantname
      FROM
        evidence
        INNER JOIN manufacturing_plant ON manufacturing_plant."id" = evidence."manufacturingPlantId" 
        AND manufacturing_plant."isActive" = true
      WHERE
        evidence."isActive" = TRUE
        AND manufacturing_plant."id" = ANY( $1::int[] )
      GROUP BY
        manufacturing_plant."name"
    `,
      [manufacturingPlantsIds],
    );

    const categories = result.map((item) => item.manufacturingplantname);

    return {
      categories,
      series: [
        {
          name: 'Abiertos',
          data: result.map((item) => Number(item.open)),
          // Mismos colores de estatus que la UI (Abierto / Cerrado).
          color: '#B45309',
        },
        {
          name: 'Cerrados',
          data: result.map((item) => Number(item.closed)),
          color: '#15803D',
        },
      ],
    };
  }

  findMainTypesGlobalTrend(manufacturingPlantId: number) {
    const query = `
      SELECT
        mt."id",
        mt.name                                                                                        AS tipo_principal,
        COUNT(*)                                                                                       AS total_historico,
        COUNT(CASE WHEN e.status = 'Abierto'   THEN 1 END)                                           AS abiertas,
        COUNT(CASE WHEN e.status = 'Cerrado'   THEN 1 END)                                           AS cerradas,
        COUNT(CASE WHEN e.status = 'Cancelado' THEN 1 END)                                           AS canceladas,
        ROUND(COUNT(CASE WHEN e.status = 'Cerrado' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 1)    AS pct_resolucion_historica,
        COALESCE(ma.total, 0)                                                                          AS total_mes_actual,
        COALESCE(mp.total, 0)                                                                          AS total_mes_anterior,
        COALESCE(ma.cerradas, 0)                                                                       AS cerradas_mes_actual,
        COALESCE(mp.cerradas, 0)                                                                       AS cerradas_mes_anterior,
        COALESCE(ma.abiertas, 0)                                                                       AS abiertas_mes_actual,
        COALESCE(mp.abiertas, 0)                                                                       AS abiertas_mes_anterior,
        CASE
          WHEN COALESCE(mp.total, 0) = 0 AND COALESCE(ma.total, 0) > 0 THEN 100.0
          WHEN COALESCE(mp.total, 0) = 0                                THEN 0.0
          ELSE ROUND((COALESCE(ma.total, 0) - COALESCE(mp.total, 0)) * 100.0 / COALESCE(mp.total, 0), 1)
        END AS pct_cambio_total,
        CASE
          WHEN COALESCE(mp.cerradas, 0) = 0 AND COALESCE(ma.cerradas, 0) > 0 THEN 100.0
          WHEN COALESCE(mp.cerradas, 0) = 0                                    THEN 0.0
          ELSE ROUND((COALESCE(ma.cerradas, 0) - COALESCE(mp.cerradas, 0)) * 100.0 / COALESCE(mp.cerradas, 0), 1)
        END AS pct_cambio_cerradas,
        CASE
          WHEN COALESCE(mp.abiertas, 0) = 0 AND COALESCE(ma.abiertas, 0) > 0 THEN 100.0
          WHEN COALESCE(mp.abiertas, 0) = 0                                    THEN 0.0
          ELSE ROUND((COALESCE(ma.abiertas, 0) - COALESCE(mp.abiertas, 0)) * 100.0 / COALESCE(mp.abiertas, 0), 1)
        END AS pct_cambio_abiertas
      FROM evidence e
      JOIN main_type mt ON e."mainTypeId" = mt.id
      LEFT JOIN (
        SELECT "mainTypeId",
          COUNT(*)                                          AS total,
          COUNT(CASE WHEN status = 'Abierto'   THEN 1 END) AS abiertas,
          COUNT(CASE WHEN status = 'Cerrado'   THEN 1 END) AS cerradas,
          COUNT(CASE WHEN status = 'Cancelado' THEN 1 END) AS canceladas
        FROM evidence
        WHERE "manufacturingPlantId" = $1
          AND "createdAt" >= DATE_TRUNC('month', NOW())
          AND "createdAt" <= NOW()
        GROUP BY "mainTypeId"
      ) ma ON mt.id = ma."mainTypeId"
      LEFT JOIN (
        SELECT "mainTypeId",
          COUNT(*)                                          AS total,
          COUNT(CASE WHEN status = 'Abierto'   THEN 1 END) AS abiertas,
          COUNT(CASE WHEN status = 'Cerrado'   THEN 1 END) AS cerradas,
          COUNT(CASE WHEN status = 'Cancelado' THEN 1 END) AS canceladas
        FROM evidence
        WHERE "manufacturingPlantId" = $1
          AND "createdAt" >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
          AND "createdAt" <= NOW() - INTERVAL '1 month'
        GROUP BY "mainTypeId"
      ) mp ON mt.id = mp."mainTypeId"
      WHERE e."manufacturingPlantId" = $1
      GROUP BY mt.id, mt.name, ma.total, ma.abiertas, ma.cerradas, ma.canceladas,
              mp.total, mp.abiertas, mp.cerradas, mp.canceladas
      ORDER BY total_historico DESC;
    `;

    return this.queryWithParams(query, [manufacturingPlantId]);
  }

  findMainTypesGlobalTrendDetails(
    manufacturingPlantId: number,
    mainTypeId: number,
  ) {
    const query = `
        SELECT
          u.id                                                                                        AS responsable_id,
          u.name                                                                                      AS responsable,
          COUNT(DISTINCT e.id)                                                                        AS total_asignadas,
          COUNT(DISTINCT CASE WHEN e.status = 'Abierto'   THEN e.id END)                            AS abiertas,
          COUNT(DISTINCT CASE WHEN e.status = 'Cerrado'   THEN e.id END)                            AS cerradas,
          COUNT(DISTINCT CASE WHEN e.status = 'Cancelado' THEN e.id END)                            AS canceladas,
          COALESCE(ROUND(COUNT(DISTINCT CASE WHEN e.status = 'Cerrado' THEN e.id END) * 100.0
            / NULLIF(COUNT(DISTINCT e.id), 0), 1), 0)                                               AS pct_resolucion,
          COALESCE(ROUND(AVG(CASE
            WHEN e.status = 'Cerrado' AND e."solutionDate" IS NOT NULL
            THEN EXTRACT(DAY FROM e."solutionDate" - e."createdAt")
          END)::numeric, 1), 0)                                                                      AS promedio_dias_resolucion,
          COUNT(DISTINCT CASE
            WHEN e.status = 'Abierto'
            AND e."createdAt" < NOW() - INTERVAL '90 days'
            THEN e.id END)                                                                            AS criticos_mas_90_dias,
          COUNT(DISTINCT CASE
            WHEN e.status = 'Abierto'
            AND e."createdAt" >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
            AND e."createdAt" <= NOW() - INTERVAL '1 month'
            THEN e.id END)                                                                            AS asignadas_mes_anterior,
          COUNT(DISTINCT CASE
            WHEN e.status = 'Abierto'
            AND e."createdAt" >= DATE_TRUNC('month', NOW())
            AND e."createdAt" <= NOW()
            THEN e.id END)                                                                            AS asignadas_mes_actual,
          MAX(EXTRACT(DAY FROM NOW() - e."createdAt"))::int                                          AS max_dias_sin_resolver
        FROM evidence_responsibles_user eru
        JOIN evidence e  ON eru."evidenceId" = e.id
        JOIN "user" u    ON eru."userId"     = u.id
        JOIN main_type mt ON e."mainTypeId"  = mt.id
        WHERE e."manufacturingPlantId" = $1
          AND mt."id" = $2
        GROUP BY u.id, u.name
        ORDER BY abiertas DESC, pct_resolucion ASC;
      `;

    return this.queryWithParams(query, [manufacturingPlantId, mainTypeId]);
  }

  findPercentageComplianceByZone(
    manufacturingPlantId: number,
    mainTypeId: number,
  ) {
    const query = `
      SELECT
        mp.name                                                                                     AS planta,
        z.name                                                                                      AS zona,
        COUNT(DISTINCT e.id)                                                                        AS total_hallazgos,
        COUNT(DISTINCT CASE WHEN e.status = 'Cerrado'   THEN e.id END)                            AS cerradas,
        COUNT(DISTINCT CASE WHEN e.status = 'Abierto'   THEN e.id END)                            AS abiertas,
        COUNT(DISTINCT CASE WHEN e.status = 'Cancelado' THEN e.id END)                            AS canceladas,
        ROUND(COUNT(DISTINCT CASE WHEN e.status = 'Cerrado' THEN e.id END) * 100.0
          / NULLIF(COUNT(DISTINCT e.id), 0), 1)                                                    AS pct_cumplimiento_historico,
        COALESCE(ROUND(COUNT(DISTINCT CASE
          WHEN e.status = 'Cerrado'
          AND e."createdAt" >= DATE_TRUNC('month', NOW())
          AND e."createdAt" <= NOW()
          THEN e.id END) * 100.0
          / NULLIF(COUNT(DISTINCT CASE
            WHEN e."createdAt" >= DATE_TRUNC('month', NOW())
            AND e."createdAt" <= NOW()
          THEN e.id END), 0), 1), 0)                                                               AS pct_cumplimiento_mes_actual,
        COALESCE(ROUND(COUNT(DISTINCT CASE
          WHEN e.status = 'Cerrado'
          AND e."createdAt" >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
          AND e."createdAt" <= NOW() - INTERVAL '1 month'
          THEN e.id END) * 100.0
          / NULLIF(COUNT(DISTINCT CASE
            WHEN e."createdAt" >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
            AND e."createdAt" <= NOW() - INTERVAL '1 month'
          THEN e.id END), 0), 1), 0)                                                               AS pct_cumplimiento_mes_anterior,
        COUNT(DISTINCT CASE
          WHEN e.status = 'Abierto'
          AND e."createdAt" < NOW() - INTERVAL '90 days'
          THEN e.id END)                                                                            AS criticos_mas_90_dias,
        COALESCE(ROUND(AVG(CASE
          WHEN e.status = 'Cerrado' AND e."solutionDate" IS NOT NULL
          THEN EXTRACT(DAY FROM e."solutionDate" - e."createdAt")
        END)::numeric, 1), 0)                                                                      AS promedio_dias_resolucion
      FROM evidence e
      JOIN zones z                 ON e."zoneId"               = z.id
      JOIN manufacturing_plant mp  ON e."manufacturingPlantId" = mp.id
      JOIN main_type mt            ON e."mainTypeId"           = mt.id
      WHERE mp.id = $1
        AND mt.id = $2
      GROUP BY mp.id, mp.name, z.id, z.name
      HAVING COUNT(DISTINCT e.id) > 0
      ORDER BY pct_cumplimiento_historico ASC, criticos_mas_90_dias DESC;
    `;

    return this.queryWithParams(query, [manufacturingPlantId, mainTypeId]);
  }
}
