/**
 * Integración: análisis de datos EPP (/dashboard/business-intelligence/epp)
 * contra la base de pruebas. Comprueba con datos reales:
 * - Solo administradores (General recibe 403).
 * - Indicadores "a la fecha": el mes en curso contra los mismos días del mes
 *   anterior, no contra el mes completo.
 * - Las entregas de equipos sin precio cuentan en unidades y colaboradores
 *   (antes las gráficas mensuales las perdían) y suman $0 al gasto.
 * - hasPrices: una planta sin precios capturados oculta lo de gasto en la UI.
 * - tracksDeliveryFrequency: sin frecuencias en al menos la mitad de sus
 *   equipos, la UI oculta lo de fuera de rango.
 */
import {
  Employee,
  EmployeeArea,
  EmployeePosition,
} from '../../src/employees/entities/index.js';
import { Epp, EppEquipment } from '../../src/epps/entities/index.js';
import {
  Equipment,
  EquipmentCostHistory,
} from '../../src/equipments/entities/index.js';
import { Genre } from '../../src/genres/entities/genre.entity.js';
import { createE2eApp, type E2eApp } from './e2e-app.js';

const SIGNATURE = 'data:image/png;base64,iVBORw0KGgo=';
const ROUTE = '/dashboard/business-intelligence/epp';

/** 'YYYY-MM-DD' + n días (aritmética en UTC, sin horas). */
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

describe('Integración: análisis de datos EPP', () => {
  let e2e: E2eApp;
  // Fechas según CURRENT_DATE de la base (la misma que usa el SQL).
  let today: string, curStart: string, prevStart: string, prevLast: string;
  let ana: Employee, luis: Employee;

  beforeAll(async () => {
    e2e = await createE2eApp();
    const { dataSource, base } = e2e;
    const repo = <T extends object>(entity: new () => T) =>
      dataSource.getRepository(entity);
    const { tepotzotlan, manizales } = base.plants;

    [{ today, curStart, prevStart }] = await dataSource.query(`
      SELECT CURRENT_DATE::text AS today,
             date_trunc('month', CURRENT_DATE)::date::text AS "curStart",
             (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date::text AS "prevStart"`);
    prevLast = addDays(curStart, -1);

    const area = await repo(EmployeeArea).save({ name: 'Producción' });
    const position = await repo(EmployeePosition).save({ name: 'Operador' });
    const gender = await repo(Genre).save({ name: 'Femenino' });
    const employee = (code: number, name: string, plant = tepotzotlan) =>
      repo(Employee).save({
        code,
        name,
        area,
        position,
        gender,
        manufacturingPlants: [plant],
      });
    ana = await employee(1, 'Ana');
    const beto = await employee(2, 'Beto');
    const carla = await employee(3, 'Carla');
    luis = await employee(4, 'Luis', manizales);
    const marta = await employee(5, 'Marta', manizales);

    const equipment = async (
      name: string,
      plant = tepotzotlan,
      price?: number,
      deliveryFrequency: number | null = 30,
    ) => {
      const saved = await repo(Equipment).save({
        name,
        deliveryFrequency: deliveryFrequency as number,
        manufacturingPlant: plant,
        createdBy: base.users.admin,
      });
      if (price !== undefined) {
        await repo(EquipmentCostHistory).save({
          price,
          captureDate: new Date(),
          equipment: saved,
        });
      }
      return saved;
    };
    const casco = await equipment('Casco', tepotzotlan, 100);
    const lentes = await equipment('Lentes'); // sin precio
    const guantes = await equipment('Guantes', manizales, 0);
    const botas = await equipment('Botas', manizales); // cada 30 días
    // Manizales: 2 de 5 equipos con frecuencia (menos de la mitad).
    for (const name of ['Casco', 'Lentes', 'Overol']) {
      await equipment(name, manizales, undefined, null);
    }

    const deliver = async (
      emp: Employee,
      eq: Equipment,
      quantity: number,
      date: string,
      outOfRangeDelivery = false,
    ) => {
      const epp = await repo(Epp).save({
        employee: emp,
        signature: SIGNATURE,
        createBy: base.users.admin,
      });
      await repo(EppEquipment).save({
        epp,
        equipment: eq,
        quantity,
        observations: '',
        outOfRangeDelivery,
        deliveryDate: new Date(`${date}T12:00:00Z`),
      });
    };

    // Mes en curso.
    await deliver(ana, casco, 2, curStart);
    await deliver(beto, lentes, 1, curStart, true); // sin precio, fuera de rango
    await deliver(carla, casco, 1, curStart); // primera entrega de Carla
    // Mes anterior: el día 1 siempre entra en "a la fecha"; el último día
    // solo si hoy es fin de mes (fin_anterior lo alcanza).
    await deliver(ana, casco, 1, prevStart);
    await deliver(beto, casco, 5, prevLast);
    // Otra planta (sin precios).
    await deliver(luis, guantes, 3, curStart);
    // Fuera de rango con historial: Luis recibe Botas el día 1 del mes
    // anterior y otra vez 10 días después (debía esperar 30: 20 días antes).
    await deliver(luis, botas, 1, prevStart);
    await deliver(luis, botas, 1, addDays(prevStart, 10), true);
    await deliver(marta, botas, 1, addDays(prevStart, 5));
  });

  afterAll(() => e2e?.close());

  const get = (plantId: number, token = e2e.tokens.admin) =>
    e2e.call('get', `${ROUTE}?manufacturingPlantId=${plantId}`, token);

  it('un usuario General recibe 403', async () => {
    await get(1, e2e.tokens.general).expect(403);
  });

  it('compara el mes a la fecha contra los mismos días del mes anterior', async () => {
    const { body } = await get(1).expect(200);
    const finAnterior = body.kpis.periodo.anterior.hasta as string;
    // El último día del mes anterior entra solo si ya pasamos ese número de día.
    const lastDayCounts = prevLast <= finAnterior;

    expect(body.kpis.periodo).toEqual({
      actual: { desde: curStart, hasta: today },
      anterior: { desde: prevStart, hasta: finAnterior },
    });
    expect(finAnterior <= prevLast).toBe(true);

    expect(body.kpis.actual).toEqual({
      gasto: 300, // casco 2×100 + casco 1×100 + lentes sin precio $0
      unidades: 4,
      entregas: 3,
      fueraDeRango: 1,
      empleados: 3,
      primeraVez: 1, // Carla
    });
    expect(body.kpis.anterior).toEqual({
      gasto: lastDayCounts ? 600 : 100,
      unidades: lastDayCounts ? 6 : 1,
      entregas: lastDayCounts ? 2 : 1,
      fueraDeRango: 0,
      empleados: lastDayCounts ? 2 : 1,
      primeraVez: lastDayCounts ? 2 : 1,
    });
  });

  it('las entregas sin precio cuentan en unidades y colaboradores del mes', async () => {
    const { body } = await get(1).expect(200);
    const month = body.chart8.find(
      (row: { mes_date: string }) =>
        String(row.mes_date).slice(0, 7) === curStart.slice(0, 7),
    );

    // Beto solo recibió Lentes (sin precio) este mes: antes no se contaba.
    expect(month).toMatchObject({
      unidades_total: '4',
      empleados_con_entrega: '3',
    });
    expect(Number(month.gasto_total)).toBe(300);
    // Gasto por equipo y participación solo listan equipos con gasto.
    expect(
      body.chart1.map((row: { equipment_name: string }) => row.equipment_name),
    ).toEqual(['Casco']);
    expect(
      body.chart9.map((row: { equipment_name: string }) => row.equipment_name),
    ).toEqual(['Casco']);
  });

  it('indica si la planta tiene precios y ya no envía lo eliminado', async () => {
    const tepotzotlan = (await get(1).expect(200)).body;
    const manizales = (await get(2).expect(200)).body;

    expect(tepotzotlan.hasPrices).toBe(true);
    expect(manizales.hasPrices).toBe(false);
    // Tepotzotlán: todos sus equipos con frecuencia; Manizales: 2 de 5.
    expect(tepotzotlan.tracksDeliveryFrequency).toBe(true);
    expect(manizales.tracksDeliveryFrequency).toBe(false);
    expect(manizales.kpis.actual.unidades).toBe(3);
    for (const removed of ['chart2', 'chart5', 'chart6', 'chart7']) {
      expect(tepotzotlan).not.toHaveProperty(removed);
    }
  });

  /** 'YYYY-MM-DD' → 'DD/MM/YYYY' (formato de los filtros). */
  const ddmmyyyy = (iso: string) => iso.split('-').reverse().join('/');
  const range = () =>
    `startDate=${ddmmyyyy(prevStart)}&endDate=${ddmmyyyy(today)}`;

  it('con un periodo elegido: el mes anterior completo contra el previo', async () => {
    const { body } = await e2e
      .call(
        'get',
        `${ROUTE}?manufacturingPlantId=1&startDate=${ddmmyyyy(prevStart)}&endDate=${ddmmyyyy(prevLast)}`,
        e2e.tokens.admin,
      )
      .expect(200);

    expect(body.kpis.periodo.actual).toEqual({
      desde: prevStart,
      hasta: prevLast,
    });
    // Ana: casco 1×100; Beto: casco 5×100 (último día del mes).
    expect(body.kpis.actual).toMatchObject({
      gasto: 600,
      unidades: 6,
      entregas: 2,
    });
    // Las gráficas mensuales solo muestran los meses del periodo.
    expect(body.chart8).toHaveLength(1);
    expect(body.chart3).toHaveLength(1);
  });

  it('un periodo inválido responde 400', async () => {
    await e2e
      .call(
        'get',
        `${ROUTE}?manufacturingPlantId=1&startDate=22/10/2026&endDate=01/10/2026`,
        e2e.tokens.admin,
      )
      .expect(400);
  });

  it('fuera de rango: equipos y colaboradores, con días de anticipación', async () => {
    await e2e
      .call(
        'get',
        `${ROUTE}/out-of-range?manufacturingPlantId=2`,
        e2e.tokens.general,
      )
      .expect(403);
    const { body } = await e2e
      .call(
        'get',
        `${ROUTE}/out-of-range?manufacturingPlantId=2&${range()}`,
        e2e.tokens.admin,
      )
      .expect(200);

    // Guantes no tuvo entregas fuera de rango: no aparece.
    expect(body.byEquipment).toEqual([
      {
        equipmentId: expect.any(Number),
        equipmentName: 'Botas',
        deliveries: 3,
        outOfRange: 1,
        employees: 1,
        averageDaysEarly: 20,
      },
    ]);
    // Solo Luis (Marta nunca fuera de rango), con todos sus equipos.
    expect(
      body.byEmployeeEquipment.map(
        ({
          name,
          equipmentName,
          deliveries,
          outOfRange,
          averageDaysEarly,
        }: Record<string, unknown>) => [
          name,
          equipmentName,
          deliveries,
          outOfRange,
          averageDaysEarly,
        ],
      ),
    ).toEqual([
      ['Luis', 'Botas', 2, 1, 20],
      ['Luis', 'Guantes', 1, 0, null],
    ]);
  });

  it('detalle de colaborador: entregas, anticipación y quién registró', async () => {
    const { body } = await e2e
      .call(
        'get',
        `${ROUTE}/employees/${luis.id}?manufacturingPlantId=2&${range()}`,
        e2e.tokens.admin,
      )
      .expect(200);

    expect(body.employee).toMatchObject({
      id: luis.id,
      name: 'Luis',
      code: '4',
    });
    expect(
      body.deliveries.map(
        ({
          date,
          equipmentName,
          outOfRange,
          daysEarly,
          previousDelivery,
        }: Record<string, unknown>) => [
          date,
          equipmentName,
          outOfRange,
          daysEarly,
          previousDelivery,
        ],
      ),
    ).toEqual([
      [curStart, 'Guantes', false, null, null],
      [addDays(prevStart, 10), 'Botas', true, 20, prevStart],
      [prevStart, 'Botas', false, null, null],
    ]);
    expect(body.deliveries[1].registeredBy).toBe(e2e.base.users.admin.name);
  });

  it('detalle de un colaborador de otra planta: 404', async () => {
    await e2e
      .call(
        'get',
        `${ROUTE}/employees/${ana.id}?manufacturingPlantId=2`,
        e2e.tokens.admin,
      )
      .expect(404);
  });
});
