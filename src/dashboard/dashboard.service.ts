import { REQUEST } from '@nestjs/core';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { In, MoreThan, Repository } from 'typeorm';
import { Request } from 'express';

import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { AccidentRate } from './entities/accident-rate.entity';
import { User } from 'users/entities/user.entity';
import { groupBy } from '@shared/utils';

import 'moment/locale/es';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(ManufacturingPlant)
    private readonly manufacturingPlant: Repository<ManufacturingPlant>,
    @InjectRepository(AccidentRate)
    private readonly accidentRate: Repository<AccidentRate>,
    @Inject(REQUEST) private readonly request: Request,
  ) {}

  findMyEvidences(userId: number) {
    const queryRaw = `
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

    const query = this.manufacturingPlant.manager.query(queryRaw);

    return query;
  }

  async findCriticalZones(manufacturingPlantId: number) {
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
      AND mp.id = ${manufacturingPlantId}
    GROUP BY mp.id, mp.name, z.id, z.name
    ORDER BY total_abiertas DESC, max_dias_sin_resolver DESC;
  `;

    const result = await this.manufacturingPlant.manager.query(query);

    return result;
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

    const categories = await manager.query(`
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
    `);

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
}
