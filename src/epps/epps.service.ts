import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RequestContextService } from '../shared/services/request-context.service.js';

import { Brackets, In, Repository } from 'typeorm';

import {
  CreateEppDto,
  type EppSortableColumn,
  QueryEppDto,
  UpdateEppDto,
} from './dto/index.js';
import { Equipment } from '../equipments/entities/index.js';
import { Epp, EppEquipment } from './entities/index.js';
import { Employee } from '../employees/entities/index.js';
import { buildFileNameTimestamp } from '../shared/utils/index.js';
import { buildEppFileName } from './epp-file-name.js';
import { plantDeliveryDate } from './epp-delivery-date.js';

@Injectable()
export class EppsService {
  private readonly relations: string[] = [
    'employee',
    'employee.position',
    'employee.area',
    'createBy',
    'equipments',
    'equipments.equipment',
    'equipments.equipment.manufacturingPlant',
  ];

  constructor(
    @InjectRepository(Epp)
    private readonly eppRepository: Repository<Epp>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly requestContext: RequestContextService,
    @InjectRepository(EppEquipment)
    private readonly eppEquipmentRepository: Repository<EppEquipment>,
    @InjectRepository(Equipment)
    private readonly equipmentRepository: Repository<Equipment>,
  ) {}

  private mapActiveHistory<T extends { epps: Epp[] }>(
    items: T[],
    plantIds: number[],
  ): T[] {
    return items
      .map((item) => ({
        ...item,
        epps: item.epps
          .filter((epp) => epp.isActive)
          .map((epp) => ({
            ...epp,
            equipments: epp.equipments.filter(
              (equipment) =>
                equipment.isActive &&
                plantIds.includes(
                  Number(equipment.equipment?.manufacturingPlant?.id),
                ),
            ),
          }))
          .filter((epp) => epp.equipments.length > 0),
      }))
      .filter((item) => item.epps.length > 0);
  }

  private mapActiveEquipments(epps: Epp[], plantIds: number[]): Epp[] {
    return epps
      .filter((epp) => epp.isActive)
      .map((epp) => ({
        ...epp,
        equipments: epp.equipments.filter(
          (equipment) =>
            equipment.isActive &&
            plantIds.includes(
              Number(equipment.equipment?.manufacturingPlant?.id),
            ),
        ),
      }))
      .filter((epp) => epp.equipments.length > 0);
  }

  /** Plantas del usuario en sesión (filtro de todas las consultas por id). */
  private get userPlantIds() {
    return In(this.requestContext.manufacturingPlantIds);
  }

  async validateDeliveryFrequency(
    equipmentId: number,
    employeeId: number,
    historyRepository = this.eppEquipmentRepository,
    equipmentRepository = this.equipmentRepository,
  ) {
    // Solo equipos de las plantas del usuario: uno ajeno responde 404.
    const equipment = await equipmentRepository.findOne({
      where: {
        id: equipmentId,
        isActive: true,
        manufacturingPlant: { id: this.userPlantIds },
      },
    });

    if (!equipment) {
      throw new NotFoundException(`El equipo con id ${equipmentId} no existe.`);
    }

    const lastEpp = await historyRepository.findOne({
      where: {
        equipment: { id: equipmentId },
        isActive: true,
        epp: {
          employee: { id: employeeId },
          isActive: true,
        },
      },
      order: {
        deliveryDate: 'DESC',
      },
    });

    if (!lastEpp) {
      return { canDeliver: true, message: 'El equipo puede ser entregado.' };
    }

    const now = new Date();
    const deliveryFrequency = equipment.deliveryFrequency || 0;
    const nextDeliveryDate = new Date(lastEpp.deliveryDate);
    nextDeliveryDate.setDate(nextDeliveryDate.getDate() + deliveryFrequency);

    if (now >= nextDeliveryDate) {
      return { canDeliver: true, message: 'El equipo puede ser entregado.' };
    } else {
      const daysRemaining = Math.ceil(
        (nextDeliveryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      return {
        canDeliver: false,
        message: `El equipo no puede ser entregado. Faltan ${daysRemaining} día(s) para la próxima entrega.`,
      };
    }
  }

  async create(createEppDto: CreateEppDto) {
    const createBy = this.requestContext.user;
    const plantIds = this.requestContext.manufacturingPlantIds;
    const { employeeId, signature, equipments } = createEppDto;

    return this.eppRepository.manager.transaction(async (manager) => {
      const employeeRepository = manager.getRepository(Employee);
      const equipmentRepository = manager.getRepository(Equipment);
      const eppRepository = manager.getRepository(Epp);
      const historyRepository = manager.getRepository(EppEquipment);
      const employee = plantIds.length
        ? await employeeRepository.findOne({
            where: {
              id: employeeId,
              isActive: true,
              manufacturingPlants: { id: In(plantIds) },
            },
            relations: ['manufacturingPlants'],
          })
        : null;
      if (!employee)
        throw new NotFoundException(
          `Employee with ID ${employeeId} not found.`,
        );

      // Serializa las entregas del mismo empleado para que ambas no lean el
      // mismo historial vacío al validar la frecuencia.
      const locked = await employeeRepository.findOne({
        where: { id: employeeId, isActive: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked)
        throw new NotFoundException(
          `Employee with ID ${employeeId} not found.`,
        );

      const rows = [];
      for (const equipment of equipments) {
        const current = await equipmentRepository.findOne({
          where: {
            id: equipment.id,
            isActive: true,
            manufacturingPlant: { id: In(plantIds) },
          },
          relations: ['manufacturingPlant', 'manufacturingPlant.country'],
        });
        if (
          !current ||
          !employee.manufacturingPlants.some(
            (plant) =>
              Number(plant.id) === Number(current.manufacturingPlant.id),
          )
        ) {
          throw new NotFoundException(
            `Equipo con ID ${equipment.id} no encontrado.`,
          );
        }
        const frequency = current.deliveryFrequency
          ? await this.validateDeliveryFrequency(
              equipment.id,
              employeeId,
              historyRepository,
              equipmentRepository,
            )
          : null;
        rows.push({
          equipment: current,
          quantity: equipment.quantity,
          observations: equipment.observations,
          ...(frequency && { outOfRangeDelivery: !frequency.canDeliver }),
        });
      }
      const deliveredAt = new Date();
      const epp = await eppRepository.save({ employee, signature, createBy });
      for (const row of rows) {
        await historyRepository.save({
          ...row,
          epp,
          deliveryDate: plantDeliveryDate(
            deliveredAt,
            row.equipment.manufacturingPlant.country?.name,
          ),
        });
      }
      return { message: 'EPP created successfully' };
    });
  }

  /** 404 si el empleado no existe o no es de una de las plantas del usuario. */
  async assertEmployeeInUserPlants(employeeId: number) {
    const plantIds = this.requestContext.manufacturingPlantIds;
    const found =
      plantIds.length > 0 &&
      (await this.employeeRepository.exists({
        where: { id: employeeId, manufacturingPlants: { id: In(plantIds) } },
      }));

    if (!found) {
      throw new NotFoundException(`Empleado #${employeeId} no encontrado`);
    }
  }

  /** Nombre del archivo con los datos actuales del empleado y la hora del usuario. */
  async getDownloadFileName(employeeId: number, timeZone?: string) {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId },
      relations: ['position', 'manufacturingPlants'],
    });

    return buildEppFileName({
      plants: (employee?.manufacturingPlants ?? [])
        .sort((a, b) => a.id - b.id)
        .map(({ name }) => name),
      code: employee?.code,
      employeeName: employee?.name,
      position: employee?.position?.name,
      timestamp: buildFileNameTimestamp(timeZone),
    });
  }

  async findEppsByEmployeeId(employeeId: number) {
    const epps = await this.eppRepository.find({
      where: {
        employee: {
          id: employeeId,
        },
        isActive: true,
      },
      relations: this.relations,
      order: {
        createdAt: 'ASC',
      },
    });

    return this.mapActiveEquipments(
      epps,
      this.requestContext.manufacturingPlantIds,
    );
  }

  /**
   * Empleados de la planta con historial de EPP activo, paginados en la BD.
   * Mismo criterio que findAll/mapActiveHistory, pero el filtro de "tiene al
   * menos un equipo activo" va en SQL para que el total y las páginas cuadren.
   */
  async findPaginated({
    manufacturingPlantId,
    page: rawPage,
    limit: rawLimit,
    search,
    orderBy = 'name',
    order = 'asc',
    areaId,
    positionId,
    equipmentId,
    startDate,
    endDate,
    withHistory,
  }: QueryEppDto) {
    // El ValidationPipe global no transforma: los query params llegan como texto.
    const page = Math.max(1, Number(rawPage) || 1);
    const limit = Math.min(100, Math.max(1, Number(rawLimit) || 10));

    const sortColumns: Record<EppSortableColumn, string> = {
      name: 'employee.name',
      code: 'employee.code',
      position: 'position.name',
      area: 'area.name',
    };

    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin(
        'employee.manufacturingPlants',
        'manufacturingPlant',
        'manufacturingPlant.id = :manufacturingPlantId',
        { manufacturingPlantId: Number(manufacturingPlantId) },
      )
      .leftJoinAndSelect('employee.position', 'position')
      .leftJoinAndSelect('employee.area', 'area')
      .where('employee.isActive = :isActive', { isActive: true })
      .andWhere(
        `EXISTS (
          SELECT 1
            FROM epp
            JOIN epp_equipment ON epp_equipment."eppId" = epp.id
            JOIN equipment history_equipment ON history_equipment.id = epp_equipment."equipmentId"
           WHERE epp."employeeId" = employee.id
             AND epp."isActive"
             AND epp_equipment."isActive"
             AND history_equipment."manufacturingPlantId" = :manufacturingPlantId
             ${equipmentId ? 'AND epp_equipment."equipmentId" = :equipmentId' : ''}
             ${startDate ? 'AND epp_equipment."deliveryDate" >= :startDate' : ''}
             ${endDate ? 'AND epp_equipment."deliveryDate" <= :endDate' : ''}
        )`,
        {
          ...(equipmentId && { equipmentId: Number(equipmentId) }),
          ...(startDate && { startDate }),
          ...(endDate && { endDate }),
        },
      );

    if (areaId) {
      query.andWhere('area.id = :areaId', { areaId: Number(areaId) });
    }

    if (positionId) {
      query.andWhere('position.id = :positionId', {
        positionId: Number(positionId),
      });
    }

    const term = search?.trim();

    // Solo nombre o cédula: área y cargo se filtran con areaId / positionId.
    if (term) {
      query.andWhere(
        new Brackets((qb) =>
          qb
            .where('employee.name ILIKE :term')
            .orWhere('CAST(employee.code AS TEXT) ILIKE :term'),
        ),
        { term: `%${term.replace(/[\\%_]/g, '\\$&')}%` },
      );
    }

    const [employees, count] = await query
      .orderBy(
        sortColumns[orderBy],
        order === 'desc' ? 'DESC' : 'ASC',
        'NULLS LAST',
      )
      // Desempate estable para que una fila no salte entre páginas.
      .addOrderBy('employee.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    if (withHistory === 'false') {
      return { data: employees, count, page, limit };
    }

    // Historial solo de los empleados de esta página.
    const epps = employees.length
      ? await this.eppRepository.find({
          where: {
            employee: { id: In(employees.map(({ id }) => id)) },
            isActive: true,
          },
          relations: [
            'employee',
            'createBy',
            'equipments',
            'equipments.equipment',
            'equipments.equipment.manufacturingPlant',
          ],
          order: { createdAt: 'ASC' },
        })
      : [];

    const eppsByEmployee = new Map<number, Epp[]>();

    for (const { employee, ...epp } of epps) {
      const list = eppsByEmployee.get(employee.id) ?? [];
      list.push(epp as Epp);
      eppsByEmployee.set(employee.id, list);
    }

    const data = employees.map((employee) => ({
      ...employee,
      epps: this.mapActiveEquipments(eppsByEmployee.get(employee.id) ?? [], [
        Number(manufacturingPlantId),
      ]),
    }));

    return { data, count, page, limit };
  }

  /**
   * Historial de entregas activas de un empleado en la planta, una fila por
   * equipo entregado (como lo muestra la tabla de EPP al expandir la fila).
   * 404 si el empleado no es de las plantas del usuario.
   */
  async findEmployeeHistory(employeeId: number, manufacturingPlantId: number) {
    await this.assertEmployeeInUserPlants(employeeId);

    const epps = await this.eppRepository.find({
      where: { employee: { id: employeeId }, isActive: true },
      relations: [
        'createBy',
        'equipments',
        'equipments.equipment',
        'equipments.equipment.manufacturingPlant',
      ],
      order: { createdAt: 'ASC', equipments: { id: 'ASC' } },
    });

    return this.mapActiveEquipments(epps, [
      Number(manufacturingPlantId),
    ]).flatMap(({ signature, createBy, equipments }) =>
      equipments.map(({ id, deliveryDate, observations, equipment }) => ({
        id,
        deliveryDate,
        observations,
        equipment: { id: equipment.id, name: equipment.name },
        signature,
        createBy: createBy && { id: createBy.id, name: createBy.name },
      })),
    );
  }

  async findAll(manufacturingPlantId: number) {
    const employees = await this.employeeRepository.find({
      where: {
        isActive: true,
        manufacturingPlants: {
          id: manufacturingPlantId,
        },
        epps: {
          isActive: true,
        },
      },
      relations: [
        'position',
        'area',
        'epps',
        'epps.createBy',
        'epps.equipments',
        'epps.equipments.equipment',
        'epps.equipments.equipment.manufacturingPlant',
      ],
      order: {
        name: 'ASC',
      },
    });

    return this.mapActiveHistory(employees, [Number(manufacturingPlantId)]);
  }

  async findOne(id: number) {
    // Solo EPP de empleados de las plantas del usuario: uno ajeno responde 404.
    const epp = await this.eppRepository.findOne({
      where: {
        id,
        isActive: true,
        employee: { manufacturingPlants: { id: this.userPlantIds } },
      },
      relations: this.relations,
    });

    if (!epp) {
      throw new NotFoundException(`EPP with ID ${id} not found.`);
    }

    const visible = this.mapActiveEquipments(
      [epp],
      this.requestContext.manufacturingPlantIds,
    )[0];
    if (!visible) throw new NotFoundException(`EPP with ID ${id} not found.`);
    return visible;
  }

  update(id: number, updateEppDto: UpdateEppDto) {
    return { id, updateEppDto };
  }

  remove(id: number) {
    return `This action removes a #${id} epp`;
  }

  async removeHistory(equipmentHistoryId: number) {
    return this.eppRepository.manager.transaction(async (manager) => {
      const historyRepository = manager.getRepository(EppEquipment);
      const eppRepository = manager.getRepository(Epp);
      // Solo historial de empleados de las plantas del usuario: uno ajeno
      // responde 404 (y no se borra nada).
      const equipmentHistory = await historyRepository.findOne({
        where: {
          id: equipmentHistoryId,
          equipment: { manufacturingPlant: { id: this.userPlantIds } },
          epp: { employee: { manufacturingPlants: { id: this.userPlantIds } } },
        },
        relations: [
          'epp',
          'epp.equipments',
          'epp.equipments.equipment',
          'epp.equipments.equipment.manufacturingPlant',
        ],
      });

      if (!equipmentHistory) {
        throw new NotFoundException(
          `Registro de historial con ID ${equipmentHistoryId} no encontrado.`,
        );
      }

      const allowed = this.requestContext.manufacturingPlantIds;
      if (
        equipmentHistory.epp.equipments.some(
          (row) =>
            !allowed.includes(Number(row.equipment.manufacturingPlant.id)),
        )
      ) {
        throw new NotFoundException('Registro de historial no encontrado.');
      }
      const eppId = equipmentHistory.epp.id;

      await historyRepository
        .createQueryBuilder()
        .delete()
        .from(EppEquipment)
        .where('"eppId" = :eppId', { eppId })
        .execute();

      await eppRepository.delete(eppId);

      return {
        message:
          'Registro eliminado correctamente. Se borraron el EPP y su historial relacionado.',
      };
    });
  }
}
