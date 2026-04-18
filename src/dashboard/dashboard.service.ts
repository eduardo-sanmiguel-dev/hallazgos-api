import { REQUEST } from '@nestjs/core';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { In, MoreThan, Repository, SelectQueryBuilder } from 'typeorm';
import { Request } from 'express';

import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { AccidentRate } from './entities/accident-rate.entity';
import { User } from 'users/entities/user.entity';
import { Evidence } from 'evidences/entities/evidence.entity';
import { groupBy } from '@shared/utils';

import 'moment/locale/es';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(ManufacturingPlant)
    private readonly manufacturingPlant: Repository<ManufacturingPlant>,
    @InjectRepository(AccidentRate)
    private readonly accidentRate: Repository<AccidentRate>,
    @InjectRepository(Evidence)
    private readonly evidenceRepository: Repository<Evidence>,
    @Inject(REQUEST) private readonly request: Request,
  ) {}

  private parseDateFilter(
    date: string,
    label: string,
    isEndDate = false,
  ): Date {
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

  executeQuery(query: string) {
    return this.manufacturingPlant.manager.query(query);
  }

  async findBusinessIntelligenceEpp(manufacturingPlantId: number) {
    const query1 = `
      WITH precio_vigente AS (
        SELECT DISTINCT ON
          ( "equipmentId" ) "equipmentId",
          COALESCE ( price, 0 ) AS price 
        FROM
          equipment_cost_history 
        WHERE
          "isActive" = TRUE 
        ORDER BY
          "equipmentId",
          "captureDate" DESC 
        ),
        entregas AS (
        SELECT
          eq.ID AS equipment_id,
          eq.NAME AS equipment_name,
          ee."deliveryDate",
          COALESCE ( ee.quantity, 0 ) AS quantity,
          COALESCE ( pv.price, 0 ) AS price,
          COALESCE ( ee.quantity, 0 ) * COALESCE ( pv.price, 0 ) AS costo_total 
        FROM
          epp_equipment ee
          JOIN equipment eq ON eq.ID = ee."equipmentId"
          LEFT JOIN precio_vigente pv ON pv."equipmentId" = eq.ID 
        WHERE
          eq."manufacturingPlantId" = ${manufacturingPlantId} 
          AND ee."isActive" = TRUE 
        ) SELECT
        equipment_name,
      -- Mes actual
        COALESCE ( SUM ( CASE WHEN DATE_TRUNC( 'month', "deliveryDate" ) = DATE_TRUNC( 'month', CURRENT_DATE ) THEN costo_total ELSE 0 END ), 0 ) AS gasto_mes_actual,
        COALESCE ( SUM ( CASE WHEN DATE_TRUNC( 'month', "deliveryDate" ) = DATE_TRUNC( 'month', CURRENT_DATE ) THEN quantity ELSE 0 END ), 0 ) AS unidades_mes_actual,
      -- Mes anterior
        COALESCE (
          SUM ( CASE WHEN DATE_TRUNC( 'month', "deliveryDate" ) = DATE_TRUNC( 'month', CURRENT_DATE ) - INTERVAL '1 month' THEN costo_total ELSE 0 END ),
          0 
        ) AS gasto_mes_anterior,
        COALESCE (
          SUM ( CASE WHEN DATE_TRUNC( 'month', "deliveryDate" ) = DATE_TRUNC( 'month', CURRENT_DATE ) - INTERVAL '1 month' THEN quantity ELSE 0 END ),
          0 
        ) AS unidades_mes_anterior,
      -- Diferencia absoluta
        COALESCE ( SUM ( CASE WHEN DATE_TRUNC( 'month', "deliveryDate" ) = DATE_TRUNC( 'month', CURRENT_DATE ) THEN costo_total ELSE 0 END ), 0 ) - COALESCE (
          SUM ( CASE WHEN DATE_TRUNC( 'month', "deliveryDate" ) = DATE_TRUNC( 'month', CURRENT_DATE ) - INTERVAL '1 month' THEN costo_total ELSE 0 END ),
          0 
        ) AS diferencia,
      -- Variación porcentual (0 si no hubo gasto el mes anterior)
        COALESCE (
        CASE
            
          WHEN SUM ( CASE WHEN DATE_TRUNC( 'month', "deliveryDate" ) = DATE_TRUNC( 'month', CURRENT_DATE ) - INTERVAL '1 month' THEN costo_total ELSE 0 END ) = 0 THEN
        0 ELSE ROUND(
          (
            SUM ( CASE WHEN DATE_TRUNC( 'month', "deliveryDate" ) = DATE_TRUNC( 'month', CURRENT_DATE ) THEN costo_total ELSE 0 END ) - SUM ( CASE WHEN DATE_TRUNC( 'month', "deliveryDate" ) = DATE_TRUNC( 'month', CURRENT_DATE ) - INTERVAL '1 month' THEN costo_total ELSE 0 END ) 
            ) / NULLIF (
            SUM ( CASE WHEN DATE_TRUNC( 'month', "deliveryDate" ) = DATE_TRUNC( 'month', CURRENT_DATE ) - INTERVAL '1 month' THEN costo_total ELSE 0 END ),
            0 
          ) * 100,
          2 
        ) 
        END,
        0 
        ) AS variacion_pct 
      FROM
        entregas 
      GROUP BY
        equipment_name 
      HAVING
        SUM ( costo_total ) > 0 
      ORDER BY
        gasto_mes_actual DESC;
    `;

    const query2 = `
      SELECT
        eq.NAME AS equipment_name,
      COALESCE ( ech.price, 0 ) AS precio_actual,
      COALESCE ( ech."captureDate" :: DATE, CURRENT_DATE ) AS fecha_captura 
      FROM
        equipment eq
        LEFT JOIN equipment_cost_history ech ON ech."equipmentId" = eq.ID 
        AND ech."isActive" = TRUE 
      WHERE
        eq."manufacturingPlantId" = ${manufacturingPlantId} 
        AND eq."is_active" = TRUE 
      ORDER BY
        precio_actual DESC;
    `;

    const query3 = `
      SELECT
        TO_CHAR( DATE_TRUNC( 'month', ee."deliveryDate" ), 'Mon YYYY' ) AS mes_label,
        DATE_TRUNC( 'month', ee."deliveryDate" ) AS mes,
        COUNT ( * ) AS total_entregas,
        COALESCE ( COUNT ( CASE WHEN ee."outOfRangeDelivery" = TRUE THEN 1 END ), 0 ) AS fuera_de_rango,
        COALESCE ( COUNT ( CASE WHEN COALESCE ( ee."outOfRangeDelivery", FALSE ) = FALSE THEN 1 END ), 0 ) AS en_rango,
        COALESCE (
          ROUND(
          COUNT ( CASE WHEN ee."outOfRangeDelivery" = TRUE THEN 1 END ) * 100.0 / NULLIF ( COUNT ( * ), 0 ),
        2 
        ),
        0 
        ) AS pct_fuera_de_rango 
      FROM
        epp_equipment ee
        JOIN equipment eq ON eq.ID = ee."equipmentId" 
      WHERE
        eq."manufacturingPlantId" = ${manufacturingPlantId} 
        AND ee."isActive" = TRUE 
      GROUP BY
        DATE_TRUNC( 'month', ee."deliveryDate" ) 
      ORDER BY
        mes ASC;
    `;

    const query4 = `
      SELECT
        eq.NAME AS equipment_name,
        COALESCE (
          SUM ( CASE WHEN DATE_TRUNC( 'month', ee."deliveryDate" ) = DATE_TRUNC( 'month', CURRENT_DATE ) THEN ee.quantity ELSE 0 END ),
          0 
        ) AS unidades_mes_actual,
        COALESCE (
          SUM (
          CASE
              
              WHEN DATE_TRUNC( 'month', ee."deliveryDate" ) = DATE_TRUNC( 'month', CURRENT_DATE ) - INTERVAL '1 month' THEN
              ee.quantity ELSE 0 
            END 
            ),
            0 
          ) AS unidades_mes_anterior,
          COALESCE (
            COUNT ( DISTINCT CASE WHEN DATE_TRUNC( 'month', ee."deliveryDate" ) = DATE_TRUNC( 'month', CURRENT_DATE ) THEN e."employeeId" END ),
            0 
          ) AS empleados_mes_actual,
          COALESCE (
            COUNT ( DISTINCT CASE WHEN DATE_TRUNC( 'month', ee."deliveryDate" ) = DATE_TRUNC( 'month', CURRENT_DATE ) - INTERVAL '1 month' THEN e."employeeId" END ),
            0 
          ) AS empleados_mes_anterior 
        FROM
          epp_equipment ee
          JOIN equipment eq ON eq.ID = ee."equipmentId"
          JOIN epp e ON e.ID = ee."eppId" 
        WHERE
          eq."manufacturingPlantId" = ${manufacturingPlantId} 
          AND ee."isActive" = TRUE 
          AND DATE_TRUNC( 'month', ee."deliveryDate" ) IN ( DATE_TRUNC( 'month', CURRENT_DATE ), DATE_TRUNC( 'month', CURRENT_DATE ) - INTERVAL '1 month' ) 
        GROUP BY
          eq.NAME 
        HAVING
          COALESCE (
            SUM ( CASE WHEN DATE_TRUNC( 'month', ee."deliveryDate" ) = DATE_TRUNC( 'month', CURRENT_DATE ) THEN ee.quantity ELSE 0 END ),
            0 
          ) > 0 
          OR COALESCE (
            SUM (
            CASE
                
                WHEN DATE_TRUNC( 'month', ee."deliveryDate" ) = DATE_TRUNC( 'month', CURRENT_DATE ) - INTERVAL '1 month' THEN
                ee.quantity ELSE 0 
              END 
              ),
              0 
            ) > 0 
        ORDER BY
        unidades_mes_actual DESC;
    `;

    const query5 = `
      WITH total_activos AS (
        SELECT COUNT
          ( * ) AS total 
        FROM
          employees_manufacturing_plants emp
          JOIN employee e ON e.ID = emp."employeeId" 
        WHERE
          emp."manufacturingPlantId" = ${manufacturingPlantId} 
          AND e."isActive" = TRUE 
        ),
        con_entrega_actual AS (
        SELECT COUNT
          ( DISTINCT e."employeeId" ) AS cantidad 
        FROM
          epp e
          JOIN epp_equipment ee ON ee."eppId" = e.
          ID JOIN equipment eq ON eq.ID = ee."equipmentId" 
        WHERE
          eq."manufacturingPlantId" = ${manufacturingPlantId} 
          AND ee."isActive" = TRUE 
          AND DATE_TRUNC( 'month', ee."deliveryDate" ) = DATE_TRUNC( 'month', CURRENT_DATE ) 
        ),
        con_entrega_anterior AS (
        SELECT COUNT
          ( DISTINCT e."employeeId" ) AS cantidad 
        FROM
          epp e
          JOIN epp_equipment ee ON ee."eppId" = e.
          ID JOIN equipment eq ON eq.ID = ee."equipmentId" 
        WHERE
          eq."manufacturingPlantId" = ${manufacturingPlantId} 
          AND ee."isActive" = TRUE 
          AND DATE_TRUNC( 'month', ee."deliveryDate" ) = DATE_TRUNC( 'month', CURRENT_DATE ) - INTERVAL '1 month' 
        ) SELECT T
        .total AS total_empleados_activos,
        ca.cantidad AS con_entrega_mes_actual,
        T.total - ca.cantidad AS sin_entrega_mes_actual,
        COALESCE ( ROUND( ca.cantidad * 100.0 / NULLIF ( T.total, 0 ), 2 ), 0 ) AS pct_con_entrega_actual,
        COALESCE (
          ROUND( ( T.total - ca.cantidad ) * 100.0 / NULLIF ( T.total, 0 ), 2 ),
          0 
        ) AS pct_sin_entrega_actual,
        cb.cantidad AS con_entrega_mes_anterior,
        T.total - cb.cantidad AS sin_entrega_mes_anterior,
        COALESCE ( ROUND( cb.cantidad * 100.0 / NULLIF ( T.total, 0 ), 2 ), 0 ) AS pct_con_entrega_anterior,
        COALESCE (
          ROUND( ( T.total - cb.cantidad ) * 100.0 / NULLIF ( T.total, 0 ), 2 ),
          0 
        ) AS pct_sin_entrega_anterior 
      FROM
        total_activos T,
        con_entrega_actual ca,
        con_entrega_anterior cb;
    `;

    const query6 = `
      WITH primera_entrega AS (
        SELECT
          e."employeeId",
          MIN ( ee."deliveryDate" ) AS primera_entrega_fecha 
        FROM
          epp e
          JOIN epp_equipment ee ON ee."eppId" = e.
          ID JOIN equipment eq ON eq.ID = ee."equipmentId" 
        WHERE
          eq."manufacturingPlantId" = ${manufacturingPlantId} 
          AND ee."isActive" = TRUE 
        GROUP BY
          e."employeeId" 
        ) SELECT COALESCE
        ( COUNT ( CASE WHEN DATE_TRUNC( 'month', primera_entrega_fecha ) = DATE_TRUNC( 'month', CURRENT_DATE ) THEN 1 END ), 0 ) AS primera_vez_mes_actual,
        COALESCE ( COUNT ( CASE WHEN DATE_TRUNC( 'month', primera_entrega_fecha ) = DATE_TRUNC( 'month', CURRENT_DATE ) - INTERVAL '1 month' THEN 1 END ), 0 ) AS primera_vez_mes_anterior,
        COALESCE ( COUNT ( CASE WHEN DATE_TRUNC( 'month', primera_entrega_fecha ) = DATE_TRUNC( 'month', CURRENT_DATE ) THEN 1 END ), 0 ) - COALESCE ( COUNT ( CASE WHEN DATE_TRUNC( 'month', primera_entrega_fecha ) = DATE_TRUNC( 'month', CURRENT_DATE ) - INTERVAL '1 month' THEN 1 END ), 0 ) AS diferencia 
      FROM
        primera_entrega;
    `;

    const query7 = `
      WITH primera_entrega AS (
        SELECT
          e."employeeId",
          MIN ( ee."deliveryDate" ) AS primera_entrega_fecha 
        FROM
          epp e
          JOIN epp_equipment ee ON ee."eppId" = e.
          ID JOIN equipment eq ON eq.ID = ee."equipmentId" 
        WHERE
          eq."manufacturingPlantId" = ${manufacturingPlantId} 
          AND ee."isActive" = TRUE 
        GROUP BY
          e."employeeId" 
        ),
        nuevos_este_mes AS ( SELECT "employeeId" FROM primera_entrega WHERE DATE_TRUNC( 'month', primera_entrega_fecha ) = DATE_TRUNC( 'month', CURRENT_DATE ) ) SELECT
        eq.NAME AS equipment_name,
        COALESCE ( COUNT ( DISTINCT e."employeeId" ), 0 ) AS empleados_nuevos_que_lo_recibieron 
      FROM
        epp e
        JOIN epp_equipment ee ON ee."eppId" = e.
        ID JOIN equipment eq ON eq.ID = ee."equipmentId"
        JOIN nuevos_este_mes n ON n."employeeId" = e."employeeId" 
      WHERE
        eq."manufacturingPlantId" = ${manufacturingPlantId} 
        AND ee."isActive" = TRUE 
        AND DATE_TRUNC( 'month', ee."deliveryDate" ) = DATE_TRUNC( 'month', CURRENT_DATE ) 
      GROUP BY
        eq.NAME 
      ORDER BY
        empleados_nuevos_que_lo_recibieron DESC;
    `;

    const query8 = `
      SELECT
        TO_CHAR( DATE_TRUNC( 'month', ee."deliveryDate" ), 'Mon YYYY' ) AS mes_label,
        DATE_TRUNC( 'month', ee."deliveryDate" ) AS mes_date,
        COALESCE ( SUM ( ee.quantity * ech.price ), 0 ) AS gasto_total,
        COALESCE ( SUM ( ee.quantity ), 0 ) AS unidades_total,
        COALESCE ( COUNT ( DISTINCT e."employeeId" ), 0 ) AS empleados_con_entrega 
      FROM
        epp_equipment ee
        JOIN epp e ON e.ID = ee."eppId"
        JOIN equipment eq ON eq.ID = ee."equipmentId"
        JOIN equipment_cost_history ech ON ech."equipmentId" = eq.ID 
        AND ech."isActive" = TRUE 
      WHERE
        eq."manufacturingPlantId" = ${manufacturingPlantId} 
        AND ee."isActive" = TRUE 
      GROUP BY
        DATE_TRUNC( 'month', ee."deliveryDate" ) 
      ORDER BY
        mes_date ASC;
    `;

    const query9 = `
      SELECT
        eq.NAME AS equipment_name,
        COALESCE ( SUM ( ee.quantity * ech.price ), 0 ) AS gasto_total,
        COALESCE ( SUM ( ee.quantity ), 0 ) AS unidades_total,
        COALESCE (
          ROUND(
            SUM ( ee.quantity * ech.price ) * 100.0 / NULLIF ( SUM ( SUM ( ee.quantity * ech.price ) ) OVER ( ), 0 ),
            2 
          ),
          0 
        ) AS pct_del_total 
      FROM
        epp_equipment ee
        JOIN equipment eq ON eq.ID = ee."equipmentId"
        JOIN equipment_cost_history ech ON ech."equipmentId" = eq.ID 
        AND ech."isActive" = TRUE 
      WHERE
        eq."manufacturingPlantId" = ${manufacturingPlantId} 
        AND ee."isActive" = TRUE 
      GROUP BY
        eq.NAME 
      ORDER BY
        gasto_total DESC;
    `;

    const query10 = `
      SELECT
        TO_CHAR( DATE_TRUNC( 'month', ee."deliveryDate" ), 'Mon YYYY' ) AS mes_label,
        DATE_TRUNC( 'month', ee."deliveryDate" ) AS mes_date,
        COALESCE ( COUNT ( DISTINCT e."employeeId" ), 0 ) AS empleados_con_entrega,
        COALESCE ( SUM ( ee.quantity * ech.price ), 0 ) AS gasto_total,
        COALESCE (
          ROUND( SUM ( ee.quantity * ech.price ) / NULLIF ( COUNT ( DISTINCT e."employeeId" ), 0 ), 2 ),
          0 
        ) AS gasto_promedio_por_empleado 
      FROM
        epp_equipment ee
        JOIN epp e ON e.ID = ee."eppId"
        JOIN equipment eq ON eq.ID = ee."equipmentId"
        JOIN equipment_cost_history ech ON ech."equipmentId" = eq.ID 
        AND ech."isActive" = TRUE 
      WHERE
        eq."manufacturingPlantId" = ${manufacturingPlantId} 
        AND ee."isActive" = TRUE 
      GROUP BY
        DATE_TRUNC( 'month', ee."deliveryDate" ) 
      ORDER BY
        mes_date ASC;
    `;

    const promedioGlobalChart10 = `
      SELECT COALESCE
        (
          ROUND( SUM ( ee.quantity * ech.price ) / NULLIF ( COUNT ( DISTINCT e."employeeId" ), 0 ), 2 ),
          0 
        ) AS gasto_promedio_global_por_empleado 
      FROM
        epp_equipment ee
        JOIN epp e ON e.ID = ee."eppId"
        JOIN equipment eq ON eq.ID = ee."equipmentId"
        JOIN equipment_cost_history ech ON ech."equipmentId" = eq.ID 
        AND ech."isActive" = TRUE 
      WHERE
        eq."manufacturingPlantId" = ${manufacturingPlantId} 
        AND ee."isActive" = TRUE;
    `;

    return Promise.all([
      this.executeQuery(query1),
      this.executeQuery(query2),
      this.executeQuery(query3),
      this.executeQuery(query4),
      this.executeQuery(query5),
      this.executeQuery(query6),
      this.executeQuery(query7),
      this.executeQuery(query8),
      this.executeQuery(query9),
      this.executeQuery(query10),
      this.executeQuery(promedioGlobalChart10),
    ]).then(
      ([
        Chart1,
        Chart2,
        Chart3,
        Chart4,
        Chart5,
        Chart6,
        Chart7,
        Chart8,
        Chart9,
        Chart10,
        PromedioGlobalChart10,
      ]) => ({
        chart1: Chart1,
        chart2: Chart2,
        chart3: Chart3,
        chart4: Chart4,
        chart5: Chart5,
        chart6: Chart6,
        chart7: Chart7,
        chart8: Chart8,
        chart9: Chart9,
        chart10: Chart10,
        promedioGlobalChart10:
          PromedioGlobalChart10[0]?.gasto_promedio_global_por_empleado || 0,
      }),
    );
  }

  async findMyEvidences(userId: number) {
    const query = `
      SELECT
        a.total, a.abiertas, a.cerradas, a.canceladas,
        ma.total        AS total_mes_actual,
        mp.total        AS total_mes_anterior,
        ma.abiertas     AS abiertas_mes_actual,
        mp.abiertas     AS abiertas_mes_anterior,
        ma.cerradas     AS cerradas_mes_actual,
        mp.cerradas     AS cerradas_mes_anterior,
        ma.canceladas   AS canceladas_mes_actual,
        mp.canceladas   AS canceladas_mes_anterior,
        CASE
          WHEN mp.total = 0 AND ma.total > 0 THEN 100.0
          WHEN mp.total = 0                  THEN 0.0
          ELSE ROUND((ma.total - mp.total) * 100.0 / mp.total, 1)
        END AS pct_total,
        CASE
          WHEN mp.abiertas = 0 AND ma.abiertas > 0 THEN 100.0
          WHEN mp.abiertas = 0                      THEN 0.0
          ELSE ROUND((ma.abiertas - mp.abiertas) * 100.0 / mp.abiertas, 1)
        END AS pct_abiertas,
        CASE
          WHEN mp.cerradas = 0 AND ma.cerradas > 0 THEN 100.0
          WHEN mp.cerradas = 0                      THEN 0.0
          ELSE ROUND((ma.cerradas - mp.cerradas) * 100.0 / mp.cerradas, 1)
        END AS pct_cerradas,
        CASE
          WHEN mp.canceladas = 0 AND ma.canceladas > 0 THEN 100.0
          WHEN mp.canceladas = 0                        THEN 0.0
          ELSE ROUND((ma.canceladas - mp.canceladas) * 100.0 / mp.canceladas, 1)
        END AS pct_canceladas
      FROM
      (
        SELECT
          COUNT(*)                                          AS total,
          COUNT(CASE WHEN status = 'Abierto'   THEN 1 END) AS abiertas,
          COUNT(CASE WHEN status = 'Cerrado'   THEN 1 END) AS cerradas,
          COUNT(CASE WHEN status = 'Cancelado' THEN 1 END) AS canceladas
        FROM evidence
        WHERE "userId" = ${userId}
      ) a,
      (
        SELECT
          COUNT(*)                                          AS total,
          COUNT(CASE WHEN status = 'Abierto'   THEN 1 END) AS abiertas,
          COUNT(CASE WHEN status = 'Cerrado'   THEN 1 END) AS cerradas,
          COUNT(CASE WHEN status = 'Cancelado' THEN 1 END) AS canceladas
        FROM evidence
        WHERE "userId" = ${userId}
          AND "createdAt" >= DATE_TRUNC('month', NOW())
          AND "createdAt" <= NOW()
      ) ma,
      (
        SELECT
          COUNT(*)                                          AS total,
          COUNT(CASE WHEN status = 'Abierto'   THEN 1 END) AS abiertas,
          COUNT(CASE WHEN status = 'Cerrado'   THEN 1 END) AS cerradas,
          COUNT(CASE WHEN status = 'Cancelado' THEN 1 END) AS canceladas
        FROM evidence
        WHERE "userId" = ${userId}
          AND "createdAt" >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
          AND "createdAt" <= NOW() - INTERVAL '1 month'
      ) mp;
    `;

    const result = await this.executeQuery(query);

    return result[0];
  }

  async findOpenEvidences(manufacturingPlantId: number, userId: number) {
    const query = `
      SELECT
        e.id,
        e.description,
        e."createdAt",
        mt.name  AS tipo_principal,
        st.name  AS tipo_secundario,
        z.name   AS zona,
        mp.name  AS planta,
        EXTRACT(DAY FROM NOW() - e."createdAt")::int       AS dias_abierto,
        STRING_AGG(DISTINCT ur.name, ', ' ORDER BY ur.name) AS responsables,
        STRING_AGG(DISTINCT us.name, ', ' ORDER BY us.name) AS supervisores
      FROM evidence e
      LEFT JOIN main_type mt               ON e."mainTypeId"           = mt.id
      LEFT JOIN secondary_type st          ON e."secondaryTypeId"      = st.id
      LEFT JOIN zones z                    ON e."zoneId"               = z.id
      LEFT JOIN manufacturing_plant mp     ON e."manufacturingPlantId" = mp.id
      LEFT JOIN evidence_responsibles_user eru ON eru."evidenceId"     = e.id
      LEFT JOIN "user" ur                  ON eru."userId"             = ur.id
      LEFT JOIN evidence_supervisors_user  esu ON esu."evidenceId"     = e.id
      LEFT JOIN "user" us                  ON esu."userId"             = us.id
      WHERE e."userId" = ${userId}
        AND mp."id" = ${manufacturingPlantId}
        AND e.status = 'Abierto'
        AND e."solutionDate" IS NULL
      GROUP BY e.id, e.description, e."createdAt", mt.name, st.name, z.name, mp.name
      ORDER BY e."createdAt" ASC;
    `;

    return this.executeQuery(query);
  }

  findRecentEvidences(manufacturingPlantId: number, userId: number) {
    const query = `
      SELECT
        e.id,
        e.description,
        e."createdAt",
        e.status,
        mt.name AS tipo_principal,
        st.name AS tipo_secundario,
        z.name  AS zona,
        mp.name AS planta
      FROM evidence e
      LEFT JOIN main_type mt           ON e."mainTypeId"           = mt.id
      LEFT JOIN secondary_type st      ON e."secondaryTypeId"      = st.id
      LEFT JOIN zones z                ON e."zoneId"               = z.id
      LEFT JOIN manufacturing_plant mp ON e."manufacturingPlantId" = mp.id
      WHERE e."userId" = ${userId}
      AND mp."id" = ${manufacturingPlantId}
      ORDER BY e."createdAt" DESC
      LIMIT 10;
    `;

    return this.executeQuery(query);
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
        AND mp."id" = ${manufacturingPlantId}
        AND COALESCE(a.total, 0) > 0
      ORDER BY COALESCE(a.total, 0) DESC;
    `;

    const result = await this.executeQuery(query);

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
      AND mp."id" = ${manufacturingPlantId}
    GROUP BY mp.id, mp.name, z.id, z.name
    ORDER BY total_abiertas DESC, max_dias_sin_resolver DESC;
  `;

    return this.executeQuery(query);
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
      AND mp."id" = ${manufacturingPlantId}
      AND COALESCE(a.total, 0) > 0
    ORDER BY pendientes DESC, pct_resolucion ASC;`;

    return this.executeQuery(query);
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
        AND mp."id" = ${manufacturingPlantId}
        AND e.status = 'Cerrado'
        AND e."solutionDate" IS NOT NULL
      GROUP BY mp.id, mp.name
      ORDER BY promedio_dias_historico DESC;
    `;

    const result = await this.executeQuery(query);

    return result[0];
  }

  async findAverageResolutionTimeByUser(
    manufacturingPlantId: number,
    userId: number,
    assigned: boolean,
  ) {
    const query = `
      SELECT
        mp.name                                                                                                    AS planta,
        COALESCE(ROUND(AVG(
          EXTRACT(DAY FROM e."solutionDate" - e."createdAt")
        )::numeric, 1), 0)                                                                                        AS promedio_dias_historico,
        COALESCE(MIN(EXTRACT(DAY FROM e."solutionDate" - e."createdAt"))::int, 0)                                AS minimo_dias,
        COALESCE(MAX(EXTRACT(DAY FROM e."solutionDate" - e."createdAt"))::int, 0)                                AS maximo_dias,
        COALESCE(COUNT(*), 0)                                                                                     AS total_cerradas_historico,
        COALESCE(ROUND(AVG(CASE
          WHEN e."solutionDate" >= DATE_TRUNC('month', NOW())
          AND e."solutionDate" <= NOW()
          THEN EXTRACT(DAY FROM e."solutionDate" - e."createdAt")
        END)::numeric, 1), 0)                                                                                     AS promedio_dias_mes_actual,
        COALESCE(COUNT(CASE
          WHEN e."solutionDate" >= DATE_TRUNC('month', NOW())
          AND e."solutionDate" <= NOW() THEN 1
        END), 0)                                                                                                   AS total_cerradas_mes_actual,
        COALESCE(ROUND(AVG(CASE
          WHEN e."solutionDate" >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
          AND e."solutionDate" <= NOW() - INTERVAL '1 month'
          THEN EXTRACT(DAY FROM e."solutionDate" - e."createdAt")
        END)::numeric, 1), 0)                                                                                     AS promedio_dias_mes_anterior,
        COALESCE(COUNT(CASE
          WHEN e."solutionDate" >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
          AND e."solutionDate" <= NOW() - INTERVAL '1 month' THEN 1
        END), 0)                                                                                                   AS total_cerradas_mes_anterior,
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
        END                                                                                                        AS pct_cambio_promedio
      FROM evidence_responsibles_user eru
      JOIN evidence e             ON eru."evidenceId"        = e.id
      JOIN manufacturing_plant mp ON e."manufacturingPlantId" = mp.id
      WHERE eru."userId" = ${userId}
        AND e.status = 'Cerrado'
        AND e."solutionDate" IS NOT NULL
        AND mp.id = ${manufacturingPlantId}
      GROUP BY mp.id, mp.name
      ORDER BY promedio_dias_historico DESC;
    `;

    const queryAsigned = `
      SELECT
        a.total, a.abiertas, a.cerradas, a.canceladas,
        ma.total        AS total_mes_actual,
        mp.total        AS total_mes_anterior,
        ma.abiertas     AS abiertas_mes_actual,
        mp.abiertas     AS abiertas_mes_anterior,
        ma.cerradas     AS cerradas_mes_actual,
        mp.cerradas     AS cerradas_mes_anterior,
        ma.canceladas   AS canceladas_mes_actual,
        mp.canceladas   AS canceladas_mes_anterior,
        CASE
          WHEN mp.total = 0 AND ma.total > 0 THEN 100.0
          WHEN mp.total = 0                  THEN 0.0
          ELSE ROUND((ma.total - mp.total) * 100.0 / mp.total, 1)
        END AS pct_total,
        CASE
          WHEN mp.abiertas = 0 AND ma.abiertas > 0 THEN 100.0
          WHEN mp.abiertas = 0                      THEN 0.0
          ELSE ROUND((ma.abiertas - mp.abiertas) * 100.0 / mp.abiertas, 1)
        END AS pct_abiertas,
        CASE
          WHEN mp.cerradas = 0 AND ma.cerradas > 0 THEN 100.0
          WHEN mp.cerradas = 0                      THEN 0.0
          ELSE ROUND((ma.cerradas - mp.cerradas) * 100.0 / mp.cerradas, 1)
        END AS pct_cerradas,
        CASE
          WHEN mp.canceladas = 0 AND ma.canceladas > 0 THEN 100.0
          WHEN mp.canceladas = 0                        THEN 0.0
          ELSE ROUND((ma.canceladas - mp.canceladas) * 100.0 / mp.canceladas, 1)
        END AS pct_canceladas
      FROM
      (
        SELECT
          COUNT(*)                                          AS total,
          COUNT(CASE WHEN e.status = 'Abierto'   THEN 1 END) AS abiertas,
          COUNT(CASE WHEN e.status = 'Cerrado'   THEN 1 END) AS cerradas,
          COUNT(CASE WHEN e.status = 'Cancelado' THEN 1 END) AS canceladas
        FROM evidence_responsibles_user eru
        JOIN evidence e ON eru."evidenceId" = e.id
        WHERE eru."userId" = ${userId}
      ) a,
      (
        SELECT
          COUNT(*)                                          AS total,
          COUNT(CASE WHEN e.status = 'Abierto'   THEN 1 END) AS abiertas,
          COUNT(CASE WHEN e.status = 'Cerrado'   THEN 1 END) AS cerradas,
          COUNT(CASE WHEN e.status = 'Cancelado' THEN 1 END) AS canceladas
        FROM evidence_responsibles_user eru
        JOIN evidence e ON eru."evidenceId" = e.id
        WHERE eru."userId" = ${userId}
          AND e."createdAt" >= DATE_TRUNC('month', NOW())
          AND e."createdAt" <= NOW()
      ) ma,
      (
        SELECT
          COUNT(*)                                          AS total,
          COUNT(CASE WHEN e.status = 'Abierto'   THEN 1 END) AS abiertas,
          COUNT(CASE WHEN e.status = 'Cerrado'   THEN 1 END) AS cerradas,
          COUNT(CASE WHEN e.status = 'Cancelado' THEN 1 END) AS canceladas
        FROM evidence_responsibles_user eru
        JOIN evidence e ON eru."evidenceId" = e.id
        WHERE eru."userId" = ${userId}
          AND e."manufacturingPlantId" = ${manufacturingPlantId}
          AND e."createdAt" >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
          AND e."createdAt" <= NOW() - INTERVAL '1 month'
      ) mp;
      `;

    const result = await this.executeQuery(assigned ? queryAsigned : query);

    return result[0];
  }

  async findMonthlyGlobalTrend(
    manufacturingPlantId: number,
    isAdmin: boolean,
    userId: number,
  ) {
    const queryAdmin = `
        SELECT
          mp.name                                                                                   AS planta,
          DATE_TRUNC('month', e."createdAt")                                                        AS mes,
          COUNT(*)                                                                                  AS total,
          COUNT(CASE WHEN e.status = 'Abierto'   THEN 1 END)                                        AS abiertas,
          COUNT(CASE WHEN e.status = 'Cerrado'   THEN 1 END)                                        AS cerradas,
          COUNT(CASE WHEN e.status = 'Cancelado' THEN 1 END)                                        AS canceladas,
          ROUND(COUNT(CASE WHEN e.status = 'Cerrado' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 1)  AS pct_resolucion,
          SUM(COUNT(CASE WHEN e.status = 'Abierto' THEN 1 END))
            OVER (PARTITION BY mp.id ORDER BY DATE_TRUNC('month', e."createdAt") ASC)               AS backlog_acumulado
        FROM evidence e
        JOIN manufacturing_plant mp ON e."manufacturingPlantId" = mp.id
        WHERE mp."isActive" = true 
          AND mp."id" = ${manufacturingPlantId}
          AND e."createdAt" >= DATE_TRUNC('month', NOW()) - INTERVAL '11 months'
        GROUP BY mp.id, mp.name, mes
        ORDER BY mp.name, mes ASC;
    `;

    const query = `
      SELECT
        mp.name                                                                   AS planta,
        DATE_TRUNC('month', e."createdAt")                                        AS mes,
        COUNT(*)                                                                  AS total,
        COUNT(CASE WHEN e.status = 'Abierto'   THEN 1 END)                        AS abiertas,
        COUNT(CASE WHEN e.status = 'Cerrado'   THEN 1 END)                        AS cerradas,
        COUNT(CASE WHEN e.status = 'Cancelado' THEN 1 END)                        AS canceladas,
        ROUND(COUNT(CASE WHEN e.status = 'Cerrado' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 1) AS pct_resolucion,
        SUM(COUNT(CASE WHEN e.status = 'Abierto' THEN 1 END))
          OVER (PARTITION BY mp.id ORDER BY DATE_TRUNC('month', e."createdAt") ASC) AS backlog_acumulado
      FROM evidence_responsibles_user eru
      JOIN evidence e              ON eru."evidenceId"        = e.id
      JOIN manufacturing_plant mp  ON e."manufacturingPlantId" = mp.id
      WHERE eru."userId" = ${userId}
        AND mp.id = ${manufacturingPlantId}
        AND e."createdAt" >= DATE_TRUNC('month', NOW()) - INTERVAL '11 months'
      GROUP BY mp.id, mp.name, mes
      ORDER BY mp.name, mes ASC;
    `;

    return this.executeQuery(isAdmin ? queryAdmin : query);
  }

  async findTypeEvidenceByUser(manufacturingPlantId: number, userId: number) {
    const query = `
      SELECT
        mt.name                                                                        AS tipo_principal,
        a.total                                                                        AS total_historico,
        COALESCE(ma.total, 0)                                                          AS total_mes_actual,
        COALESCE(mp.total, 0)                                                          AS total_mes_anterior,
        CASE
          WHEN COALESCE(mp.total, 0) = 0 AND COALESCE(ma.total, 0) > 0 THEN 100.0
          WHEN COALESCE(mp.total, 0) = 0                                THEN 0.0
          ELSE ROUND((COALESCE(ma.total, 0) - COALESCE(mp.total, 0)) * 100.0 / COALESCE(mp.total, 0), 1)
        END AS pct_cambio
      FROM main_type mt
      JOIN (
        SELECT e."mainTypeId", COUNT(*) AS total
        FROM evidence_responsibles_user eru
        JOIN evidence e ON eru."evidenceId" = e.id
        WHERE eru."userId" = ${userId}
          AND e.status = 'Abierto'
          AND e."manufacturingPlantId" = ${manufacturingPlantId}
        GROUP BY e."mainTypeId"
      ) a ON mt.id = a."mainTypeId"
      LEFT JOIN (
        SELECT e."mainTypeId", COALESCE(COUNT(*), 0) AS total
        FROM evidence_responsibles_user eru
        JOIN evidence e ON eru."evidenceId" = e.id
        WHERE eru."userId" = ${userId}
          AND e.status = 'Abierto'
          AND e."manufacturingPlantId" = ${manufacturingPlantId}
          AND e."createdAt" >= DATE_TRUNC('month', NOW())
          AND e."createdAt" <= NOW()
        GROUP BY e."mainTypeId"
      ) ma ON mt.id = ma."mainTypeId"
      LEFT JOIN (
        SELECT e."mainTypeId", COALESCE(COUNT(*), 0) AS total
        FROM evidence_responsibles_user eru
        JOIN evidence e ON eru."evidenceId" = e.id
        WHERE eru."userId" = ${userId}
          AND e.status = 'Abierto'
          AND e."manufacturingPlantId" = ${manufacturingPlantId}
          AND e."createdAt" >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
          AND e."createdAt" <= NOW() - INTERVAL '1 month'
        GROUP BY e."mainTypeId"
      ) mp ON mt.id = mp."mainTypeId"
      ORDER BY a.total DESC;
    `;

    return this.executeQuery(query);
  }

  findPendingBySeniorityByUser(manufacturingPlantId: number, userId: number) {
    const query = `
      SELECT
        e.id,
        e.description,
        e."createdAt",
        mt.name AS tipo_principal,
        st.name AS tipo_secundario,
        z.name  AS zona,
        mp.name AS planta,
        u.name  AS creado_por,
        EXTRACT(DAY FROM NOW() - e."createdAt")::int AS dias_sin_resolver
      FROM evidence_responsibles_user eru
      JOIN evidence e              ON eru."evidenceId"        = e.id
      LEFT JOIN main_type mt       ON e."mainTypeId"          = mt.id
      LEFT JOIN secondary_type st  ON e."secondaryTypeId"     = st.id
      LEFT JOIN zones z            ON e."zoneId"              = z.id
      LEFT JOIN manufacturing_plant mp ON e."manufacturingPlantId" = mp.id
      LEFT JOIN "user" u           ON e."userId"              = u.id
      WHERE eru."userId" = ${userId}
      AND mp."id" = ${manufacturingPlantId}
        AND e.status = 'Abierto'
        AND e."solutionDate" IS NULL
      ORDER BY dias_sin_resolver DESC;
    `;

    return this.executeQuery(query);
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
      AND mp."id" = ${manufacturingPlantId}
      AND COALESCE(a.total, 0) > 0
    ORDER BY mp.name, a.total DESC;
    `;

    return this.executeQuery(query);
  }

  findManufacturingPlantsIdsCurrentUser() {
    const user = this.request['user'] as User;

    return user.manufacturingPlants.map(
      (manufacturingPlant) => manufacturingPlant.id,
    );
  }

  async findManufacturingPlantsWithEvidences() {
    const manufacturingPlantsIds = this.findManufacturingPlantsIdsCurrentUser();

    const manufacturingPlantsWithEvidences = await this.manufacturingPlant.find(
      {
        where: {
          id: In(manufacturingPlantsIds),
          isActive: true,
          evidences: MoreThan(0),
        },
        relations: ['evidences', 'evidences.zone', 'evidences.mainType'],
        loadEagerRelations: true,
      },
    );

    return manufacturingPlantsWithEvidences;
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
      AND mp."id" = ${manufacturingPlantId}
      AND COALESCE(a.total, 0) > 0
    ORDER BY mp.name, mt.name, a.total DESC;
    `;

    return this.executeQuery(query);
  }

  async findAllStatus() {
    const manufacturingPlantsWithEvidences =
      await this.findManufacturingPlantsWithEvidences();

    const evidencesTotal = manufacturingPlantsWithEvidences.reduce(
      (acc, project) => acc + project.evidences.length,
      0,
    );

    const statusData = manufacturingPlantsWithEvidences.map((project) => {
      const porcentaje = Number(
        (project.evidences.length / evidencesTotal) * 100,
      );
      return {
        name: `${project.name} (${project.evidences.length})`,
        y: Number(porcentaje.toFixed(2)),
        drilldown: project.name,
      };
    });

    const statusSeries = [];

    for (let i = 0, t = manufacturingPlantsWithEvidences.length; i < t; i++) {
      const projectCurrent = manufacturingPlantsWithEvidences[i];

      const clientsGroupStatus = groupBy(projectCurrent.evidences, 'status');

      const data = [];

      for (const key in clientsGroupStatus) {
        const clients = clientsGroupStatus[key];
        const porcentaje = Number(
          (clients.length / projectCurrent.evidences.length) * 100,
        );
        data.push([
          `${key} (${clients.length})`,
          Number(porcentaje.toFixed(2)),
        ]);
      }

      statusSeries.push({
        name: `${projectCurrent.name}`,
        id: projectCurrent.name,
        data,
      });
    }

    return {
      statusData,
      statusSeries,
    };
  }

  async findStatusByFilters(
    manufacturingPlantId: number,
    startDate: string,
    endDate: string,
    areaId?: number,
    responsibleId?: number,
  ) {
    if (!manufacturingPlantId) {
      throw new BadRequestException('manufacturingPlantId es obligatorio');
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
          startDate: parsedStartDate,
          endDate: parsedEndDate,
        });

      if (areaId) {
        query.andWhere('zone."areaId" = :areaId', {
          areaId,
        });
      }

      return query;
    };

    let rows: { status: string; total: string }[] = [];

    if (responsibleId) {
      const rowsByResponsibles = await buildBaseQuery()
        .innerJoin(
          'evidence_responsibles_user',
          'eru',
          'eru."evidenceId" = evidence.id',
        )
        .andWhere('eru."userId" = :responsibleId', {
          responsibleId,
        })
        .groupBy('evidence.status')
        .getRawMany<{ status: string; total: string }>();

      if (rowsByResponsibles.length > 0) {
        rows = rowsByResponsibles;
      } else {
        rows = await buildBaseQuery()
          .innerJoin(
            'evidence_supervisors_user',
            'esu',
            'esu."evidenceId" = evidence.id',
          )
          .andWhere('esu."userId" = :responsibleId', {
            responsibleId,
          })
          .groupBy('evidence.status')
          .getRawMany<{ status: string; total: string }>();
      }
    } else {
      rows = await buildBaseQuery()
        .groupBy('evidence.status')
        .getRawMany<{ status: string; total: string }>();
    }

    const statusOrder = ['Abierto', 'En progreso', 'Cerrado', 'Cancelado'];
    const totalsByStatus = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = Number(row.total);
      return acc;
    }, {});

    const seriesData = statusOrder.map((status) => ({
      name: status,
      y: totalsByStatus[status] || 0,
    }));

    const total = seriesData.reduce((acc, item) => acc + item.y, 0);

    return {
      total,
      startDate,
      endDate,
      seriesData,
    };
  }

  async findAreasByFilters(
    manufacturingPlantId: number,
    startDate: string,
    endDate: string,
    areaId?: number,
    responsibleId?: number,
  ) {
    if (!manufacturingPlantId) {
      throw new BadRequestException('manufacturingPlantId es obligatorio');
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

    const buildBaseQuery = () =>
      this.evidenceRepository
        .createQueryBuilder('evidence')
        .leftJoin('evidence.zone', 'zone')
        .leftJoin('zone.area', 'area')
        .select(`COALESCE(area.name, 'Sin área')`, 'name')
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
      if (areaId) {
        query.andWhere('zone."areaId" = :areaId', {
          areaId,
        });
      }

      return query;
    };

    let rows: { name: string; total: string }[] = [];

    if (responsibleId) {
      const rowsByResponsibles = await applyOptionalAreaFilter(buildBaseQuery())
        .innerJoin(
          'evidence_responsibles_user',
          'eru',
          'eru."evidenceId" = evidence.id',
        )
        .andWhere('eru."userId" = :responsibleId', {
          responsibleId,
        })
        .groupBy('area.name')
        .getRawMany<{ name: string; total: string }>();

      if (rowsByResponsibles.length > 0) {
        rows = rowsByResponsibles;
      } else {
        rows = await applyOptionalAreaFilter(buildBaseQuery())
          .innerJoin(
            'evidence_supervisors_user',
            'esu',
            'esu."evidenceId" = evidence.id',
          )
          .andWhere('esu."userId" = :responsibleId', {
            responsibleId,
          })
          .groupBy('area.name')
          .getRawMany<{ name: string; total: string }>();
      }
    } else {
      rows = await applyOptionalAreaFilter(buildBaseQuery())
        .groupBy('area.name')
        .getRawMany<{ name: string; total: string }>();
    }

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

  async findResponsiblesByFilters(
    manufacturingPlantId: number,
    startDate: string,
    endDate: string,
    areaId: number,
  ) {
    if (!manufacturingPlantId) {
      throw new BadRequestException('manufacturingPlantId es obligatorio');
    }

    if (!startDate || !endDate) {
      throw new BadRequestException(
        'Las fechas de inicio y fin son obligatorias',
      );
    }

    if (!areaId) {
      throw new BadRequestException('areaId es obligatorio');
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

    const buildBaseQuery = () =>
      this.evidenceRepository
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
        .andWhere('zone."areaId" = :areaId', {
          areaId,
        });

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
    areaId?: number,
    responsibleId?: number,
  ) {
    if (!manufacturingPlantId) {
      throw new BadRequestException('manufacturingPlantId es obligatorio');
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

      if (areaId) {
        query
          .leftJoin('evidence.zone', 'zone')
          .andWhere('zone."areaId" = :areaId', {
            areaId,
          });
      }

      if (responsibleId) {
        query.andWhere(`${userTableAlias}."userId" = :responsibleId`, {
          responsibleId,
        });
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

    if (responsibleId) {
      const rowsByResponsibles =
        await buildResponsiblesQuery().getRawMany<RawRow>();

      rows =
        rowsByResponsibles.length > 0
          ? rowsByResponsibles
          : await buildSupervisorsQuery(false).getRawMany<RawRow>();
    } else {
      const responsiblesRows =
        await buildResponsiblesQuery().getRawMany<RawRow>();
      const supervisorsRows =
        await buildSupervisorsQuery(true).getRawMany<RawRow>();

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

      const responsibleData = responsiblesById.get(userId);

      if (!responsibleData) continue;

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
        data: sortedResponsibles.map((responsible) =>
          responsible ? responsible.statusCounts[status] || 0 : 0,
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
    const minEvidenceDateResult = await this.evidenceRepository
      .createQueryBuilder('evidence')
      .select('MIN(evidence."createdAt")', 'minDate')
      .getRawOne<{ minDate: Date | string | null }>();

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
    const monthKeyByIndex = new Map<number, string>();
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
      monthKeyByIndex.set(index, monthKey);
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
      .where('evidence."createdAt" BETWEEN :startDate AND :endDate', {
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
      startMonth: monthKeyByIndex.get(0) || '',
      endMonth: monthKeyByIndex.get(categories.length - 1) || '',
      categories,
      series,
    };
  }

  async findSankeyByFilters(
    manufacturingPlantId: number,
    startDate: string,
    endDate: string,
    areaId?: number,
    responsibleId?: number,
  ) {
    if (!manufacturingPlantId) {
      throw new BadRequestException('manufacturingPlantId es obligatorio');
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

    const buildBaseQuery = () => {
      const query = this.evidenceRepository
        .createQueryBuilder('evidence')
        .leftJoin('evidence.zone', 'zone')
        .leftJoin('zone.area', 'area')
        .select(`COALESCE(area.name, 'Sin área')`, 'areaName')
        .addSelect('evidence.status', 'status')
        .addSelect('COUNT(*)', 'total')
        .where('evidence."manufacturingPlantId" = :manufacturingPlantId', {
          manufacturingPlantId,
        })
        .andWhere('evidence."createdAt" BETWEEN :startDate AND :endDate', {
          startDate: parsedStartDate,
          endDate: parsedEndDate,
        });

      if (areaId) {
        query.andWhere('zone."areaId" = :areaId', {
          areaId,
        });
      }

      return query;
    };

    type RawRow = {
      areaName: string;
      status: string;
      total: string;
    };

    let rows: RawRow[] = [];

    if (responsibleId) {
      const rowsByResponsibles = await buildBaseQuery()
        .innerJoin(
          'evidence_responsibles_user',
          'eru',
          'eru."evidenceId" = evidence.id',
        )
        .andWhere('eru."userId" = :responsibleId', {
          responsibleId,
        })
        .groupBy('area.name')
        .addGroupBy('evidence.status')
        .getRawMany<RawRow>();

      if (rowsByResponsibles.length > 0) {
        rows = rowsByResponsibles;
      } else {
        rows = await buildBaseQuery()
          .innerJoin(
            'evidence_supervisors_user',
            'esu',
            'esu."evidenceId" = evidence.id',
          )
          .andWhere('esu."userId" = :responsibleId', {
            responsibleId,
          })
          .groupBy('area.name')
          .addGroupBy('evidence.status')
          .getRawMany<RawRow>();
      }
    } else {
      rows = await buildBaseQuery()
        .groupBy('area.name')
        .addGroupBy('evidence.status')
        .getRawMany<RawRow>();
    }

    const statusOrder = ['Abierto', 'En progreso', 'Cerrado', 'Cancelado'];

    const areaTotals = new Map<string, number>();

    for (const row of rows) {
      const current = areaTotals.get(row.areaName) || 0;
      areaTotals.set(row.areaName, current + Number(row.total));
    }

    const orderedAreas = Array.from(areaTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    const areaNodeIds = new Map<string, string>();
    orderedAreas.forEach((areaName) => {
      areaNodeIds.set(areaName, `area:${areaName}`);
    });

    const statusNodeIds = new Map<string, string>();
    statusOrder.forEach((statusName) => {
      statusNodeIds.set(statusName, `status:${statusName}`);
    });

    const links = rows
      .map((row) => ({
        from: areaNodeIds.get(row.areaName) || `area:${row.areaName}`,
        to: statusNodeIds.get(row.status) || `status:${row.status}`,
        weight: Number(row.total),
      }))
      .filter((item) => item.weight > 0)
      .sort((a, b) => b.weight - a.weight);

    const usedAreaNodeIds = new Set(links.map((item) => item.from));
    const usedStatusNodeIds = new Set(links.map((item) => item.to));

    const nodes = [
      ...orderedAreas
        .filter((areaName) =>
          usedAreaNodeIds.has(areaNodeIds.get(areaName) || `area:${areaName}`),
        )
        .map((areaName) => ({
          id: areaNodeIds.get(areaName) || `area:${areaName}`,
          name: areaName,
          column: 0,
        })),
      ...statusOrder
        .filter((statusName) =>
          usedStatusNodeIds.has(
            statusNodeIds.get(statusName) || `status:${statusName}`,
          ),
        )
        .map((statusName) => ({
          id: statusNodeIds.get(statusName) || `status:${statusName}`,
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
    areaId?: number,
    responsibleId?: number,
  ) {
    if (!manufacturingPlantId) {
      throw new BadRequestException('manufacturingPlantId es obligatorio');
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

    const buildBaseQuery = () => {
      const query = this.evidenceRepository
        .createQueryBuilder('evidence')
        .leftJoin('evidence.zone', 'zone')
        .leftJoin('zone.area', 'area')
        .select('evidence.status', 'status')
        .addSelect(`COALESCE(area.name, 'Sin área')`, 'areaName')
        .addSelect('COUNT(*)', 'total')
        .where('evidence."manufacturingPlantId" = :manufacturingPlantId', {
          manufacturingPlantId,
        })
        .andWhere('evidence."createdAt" BETWEEN :startDate AND :endDate', {
          startDate: parsedStartDate,
          endDate: parsedEndDate,
        });

      if (areaId) {
        query.andWhere('zone."areaId" = :areaId', {
          areaId,
        });
      }

      return query;
    };

    type RawRow = {
      status: string;
      areaName: string;
      total: string;
    };

    let rows: RawRow[] = [];

    if (responsibleId) {
      const rowsByResponsibles = await buildBaseQuery()
        .innerJoin(
          'evidence_responsibles_user',
          'eru',
          'eru."evidenceId" = evidence.id',
        )
        .andWhere('eru."userId" = :responsibleId', {
          responsibleId,
        })
        .groupBy('evidence.status')
        .addGroupBy('area.name')
        .getRawMany<RawRow>();

      if (rowsByResponsibles.length > 0) {
        rows = rowsByResponsibles;
      } else {
        rows = await buildBaseQuery()
          .innerJoin(
            'evidence_supervisors_user',
            'esu',
            'esu."evidenceId" = evidence.id',
          )
          .andWhere('esu."userId" = :responsibleId', {
            responsibleId,
          })
          .groupBy('evidence.status')
          .addGroupBy('area.name')
          .getRawMany<RawRow>();
      }
    } else {
      rows = await buildBaseQuery()
        .groupBy('evidence.status')
        .addGroupBy('area.name')
        .getRawMany<RawRow>();
    }

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
    areaId?: number,
    responsibleId?: number,
  ) {
    if (!manufacturingPlantId) {
      throw new BadRequestException('manufacturingPlantId es obligatorio');
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

      if (areaId) {
        query.andWhere('zone."areaId" = :areaId', {
          areaId,
        });
      }

      return query;
    };

    let rawRow: KpiRawRow | null = null;

    if (responsibleId) {
      const rawByResponsibles = await buildKpiQuery()
        .innerJoin(
          'evidence_responsibles_user',
          'eru',
          'eru."evidenceId" = evidence.id',
        )
        .andWhere('eru."userId" = :responsibleId', {
          responsibleId,
        })
        .getRawOne<KpiRawRow>();

      const hasDataInResponsibles = Number(rawByResponsibles?.total || 0) > 0;

      if (hasDataInResponsibles) {
        rawRow = rawByResponsibles;
      } else {
        rawRow = await buildKpiQuery()
          .innerJoin(
            'evidence_supervisors_user',
            'esu',
            'esu."evidenceId" = evidence.id',
          )
          .andWhere('esu."userId" = :responsibleId', {
            responsibleId,
          })
          .getRawOne<KpiRawRow>();
      }
    } else {
      rawRow = await buildKpiQuery().getRawOne<KpiRawRow>();
    }

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
    areaId?: number,
    responsibleId?: number,
  ) {
    if (!manufacturingPlantId) {
      throw new BadRequestException('manufacturingPlantId es obligatorio');
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

      if (areaId) {
        query.andWhere('zone."areaId" = :areaId', {
          areaId,
        });
      }

      return query;
    };

    let rows: RawRow[] = [];

    if (responsibleId) {
      const rowsByResponsibles = await buildBaseQuery()
        .innerJoin(
          'evidence_responsibles_user',
          'eru',
          'eru."evidenceId" = evidence.id',
        )
        .andWhere('eru."userId" = :responsibleId', {
          responsibleId,
        })
        .groupBy(monthTruncExpression)
        .orderBy(monthTruncExpression, 'ASC')
        .getRawMany<RawRow>();

      if (rowsByResponsibles.length > 0) {
        rows = rowsByResponsibles;
      } else {
        rows = await buildBaseQuery()
          .innerJoin(
            'evidence_supervisors_user',
            'esu',
            'esu."evidenceId" = evidence.id',
          )
          .andWhere('esu."userId" = :responsibleId', {
            responsibleId,
          })
          .groupBy(monthTruncExpression)
          .orderBy(monthTruncExpression, 'ASC')
          .getRawMany<RawRow>();
      }
    } else {
      rows = await buildBaseQuery()
        .groupBy(monthTruncExpression)
        .orderBy(monthTruncExpression, 'ASC')
        .getRawMany<RawRow>();
    }

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

      if (availablePoints === 0) {
        return 0;
      }

      let weightedSum = 0;
      let totalWeight = 0;

      for (let i = 0; i < availablePoints; i++) {
        const value = valuesForForecast[valuesForForecast.length - 1 - i];
        const weight = wmaWeightsNewestFirst[i];
        weightedSum += value * weight;
        totalWeight += weight;
      }

      return totalWeight > 0 ? weightedSum / totalWeight : 0;
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
      historicalCategories.length > 0
        ? actualData[historicalCategories.length - 1]
        : null,
      ...forecastDataOnly,
    ];

    const windowForVolatility = actualData.slice(-6);
    const mean =
      windowForVolatility.length > 0
        ? windowForVolatility.reduce((sum, value) => sum + value, 0) /
          windowForVolatility.length
        : 0;

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
      historicalCategories.length > 0
        ? [
            actualData[historicalCategories.length - 1],
            actualData[historicalCategories.length - 1],
          ]
        : null,
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
    const manufacturingPlantsWithEvidences =
      await this.findManufacturingPlantsWithEvidences();
    const evidencesTotal = manufacturingPlantsWithEvidences.reduce(
      (acc, project) => acc + project.evidences.length,
      0,
    );

    const statusData = manufacturingPlantsWithEvidences.map((project) => {
      const porcentaje = Number(
        (project.evidences.length / evidencesTotal) * 100,
      );
      return {
        name: `${project.name} (${project.evidences.length})`,
        y: Number(porcentaje.toFixed(2)),
        drilldown: project.name,
      };
    });

    const statusSeries = [];

    for (let i = 0, t = manufacturingPlantsWithEvidences.length; i < t; i++) {
      const projectCurrent = manufacturingPlantsWithEvidences[i];

      const evidencesArray = projectCurrent.evidences.map((item) => ({
        ...item,
        zoneName: item.zone.name,
      }));

      const clientsGroupStatus = groupBy(evidencesArray, 'zoneName');

      const data = [];

      for (const key in clientsGroupStatus) {
        const clients = clientsGroupStatus[key];
        const porcentaje = Number(
          (clients.length / projectCurrent.evidences.length) * 100,
        );
        data.push([
          `${key} (${clients.length})`,
          Number(porcentaje.toFixed(2)),
        ]);
      }

      statusSeries.push({
        name: `${projectCurrent.name}`,
        id: projectCurrent.name,
        data,
      });
    }

    return {
      statusData,
      statusSeries,
    };
  }

  async findAllMainTypes() {
    const manufacturingPlantsWithEvidences =
      await this.findManufacturingPlantsWithEvidences();

    const totalEvidences = manufacturingPlantsWithEvidences.reduce(
      (acc, project) => acc + project.evidences.length,
      0,
    );

    return {
      series: [
        {
          name: 'Plantas',
          colorByPoint: true,
          data: manufacturingPlantsWithEvidences.map((manufacturingPlant) => {
            const sizeCurrent = manufacturingPlant.evidences.length;

            const fullName = `${manufacturingPlant.name} (${sizeCurrent})`;

            return {
              name: fullName,
              y: Number(
                Number((sizeCurrent / totalEvidences) * 100).toFixed(2),
              ),
              drilldown: fullName,
            };
          }),
        },
      ],
      drilldown: {
        breadcrumbs: {
          position: {
            align: 'right',
          },
        },

        series: manufacturingPlantsWithEvidences.map((project) => {
          const evidencesArray = project.evidences.map((item) => ({
            ...item,
            mainTypeName: item.mainType.name,
          }));

          const clientsGroupStatus = groupBy(evidencesArray, 'mainTypeName');

          const data = [];

          for (const key in clientsGroupStatus) {
            const clients = clientsGroupStatus[key];
            const porcentaje = Number(
              (clients.length / project.evidences.length) * 100,
            );
            data.push([
              `${key} (${clients.length})`,
              Number(porcentaje.toFixed(2)),
            ]);
          }

          const fullName = `${project.name} (${project.evidences.length})`;

          return {
            name: `${project.name}`,
            id: fullName,
            data,
          };
        }),
      },
    };
  }

  async findAllEvidencesByMonth(year: number) {
    const manager = this.manufacturingPlant.manager;

    const manufacturingPlantsIds = this.findManufacturingPlantsIdsCurrentUser();

    const whereDefault = `
      evidence."isActive" = TRUE 
      AND evidence.status != 'Cancelado' 
      AND date_part( 'year', evidence."createdAt" ) = ${year ?? "date_part('year', CURRENT_DATE)"}  
      AND evidence."manufacturingPlantId" in (${manufacturingPlantsIds.join(
        ',',
      )})
    `;

    const queryCategories = `
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
    `;

    const categories = await manager.query(queryCategories);

    const manufacturingByMonth = [];

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

    for (const category of categories) {
      const data = await manager.query(`
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
          AND to_char( evidence."createdAt", 'Mon' ) = '${category.mon}'
        GROUP BY
          1,
          2,
          evidence."manufacturingPlantId",
          manufacturing_plant."name" 
        ORDER BY
          MIN ( evidence."createdAt" ) ASC
      `);

      manufacturingByMonth.push(
        data[0]
          ? data.map((item) => ({
              ...item,
              mon: months[item.mon] || item.mon,
            }))
          : [],
      );
    }

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

  async findAllAccidentsByMonth(year: number) {
    const manager = this.manufacturingPlant.manager;

    const where = ` 1 = 1
      -- date_part( 'year', ar.capture_date ) = ${year ?? "date_part('year', CURRENT_DATE)"}
    `;

    const response = await manager.query(`
      SELECT
        date_part( 'month', ar.capture_date ) AS mes,
        date_part( 'year', ar.capture_date ) AS anio,
        CAST(SUM(ar.number_of_employees) AS float) AS numberOfEmployees,
        CAST(SUM(ar.number_of_accidents) AS float) AS accidentes
      FROM
        accident_rate AS ar
      WHERE
        ${where}
      GROUP BY
        date_part( 'year', ar.capture_date ), date_part( 'month', ar.capture_date )
      ORDER BY
        date_part( 'month', ar.capture_date ) DESC
    `);

    return response;

    /*  const monthsLarge = {
      1: 'Enero',
      2: 'Febrero',
      3: 'Marzo',
      4: 'Abril',
      5: 'Mayo',
      6: 'Junio',
      7: 'Julio',
      8: 'Agosto',
      9: 'Septiembre',
      10: 'Octubre',
      11: 'Noviembre',
      12: 'Diciembre',
    };

    return response.map((item) => {
      const nombreMes = monthsLarge[item.mes];
      return {
        numeroDenumberOfEmployees: item.numberOfEmployees,
        numeroDeAccidentes: item.accidentes,
        nombreMes,
        numeroDeMes: item.mes,
      };
    }); */
  }

  async findTopUsersByPlant() {
    const manager = this.manufacturingPlant.manager;

    const manufacturingPlantsIds = this.findManufacturingPlantsIdsCurrentUser();

    const result = await manager.query(` 
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
        AND manufacturing_plant."id" IN ( ${manufacturingPlantsIds.join(',')} ) 
      GROUP BY
        evidence."userId",
        "user"."name",
        evidence."manufacturingPlantId",
        manufacturing_plant."name" 
      ORDER BY
        manufacturingplantname ASC,
        total DESC
    `);

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
    const manager = this.manufacturingPlant.manager;

    const manufacturingPlantsIds = this.findManufacturingPlantsIdsCurrentUser();

    const result = await manager.query(`
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
        AND manufacturing_plant."id" IN ( ${manufacturingPlantsIds.join(',')} )
      GROUP BY
        manufacturing_plant."name"
    `);

    const categories = result.map((item) => item.manufacturingplantname);

    return {
      categories,
      series: [
        {
          name: 'Abiertos',
          data: categories.map((category) => {
            const item = result.find(
              (item) => item.manufacturingplantname === category,
            );
            return item ? Number(item.open) : 0;
          }),
          color: '#FF7599',
        },
        {
          name: 'Cerrados',
          data: categories.map((category) => {
            const item = result.find(
              (item) => item.manufacturingplantname === category,
            );
            return item ? Number(item.closed) : 0;
          }),
          color: '#71BF44',
        },
      ],
    };
  }

  async findAccidentsRate() {
    //const manager = this.manufacturingPlant.manager;

    this.accidentRate;

    return {
      hola: 'mundo',
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
        WHERE "manufacturingPlantId" = ${manufacturingPlantId}
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
        WHERE "manufacturingPlantId" = ${manufacturingPlantId}
          AND "createdAt" >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
          AND "createdAt" <= NOW() - INTERVAL '1 month'
        GROUP BY "mainTypeId"
      ) mp ON mt.id = mp."mainTypeId"
      WHERE e."manufacturingPlantId" = ${manufacturingPlantId}
      GROUP BY mt.id, mt.name, ma.total, ma.abiertas, ma.cerradas, ma.canceladas,
              mp.total, mp.abiertas, mp.cerradas, mp.canceladas
      ORDER BY total_historico DESC;
    `;

    return this.executeQuery(query);
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
        WHERE e."manufacturingPlantId" = ${manufacturingPlantId}
          AND mt."id" = ${mainTypeId}
        GROUP BY u.id, u.name
        ORDER BY abiertas DESC, pct_resolucion ASC;
      `;

    return this.executeQuery(query);
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
      WHERE mp.id = ${manufacturingPlantId}
        AND mt.id = ${mainTypeId}
      GROUP BY mp.id, mp.name, z.id, z.name
      HAVING COUNT(DISTINCT e.id) > 0
      ORDER BY pct_cumplimiento_historico ASC, criticos_mas_90_dias DESC;
    `;

    return this.executeQuery(query);
  }
}
