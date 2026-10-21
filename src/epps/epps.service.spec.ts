import { NotFoundException } from '@nestjs/common';
import { Brackets, FindOperator } from 'typeorm';

import {
  buildManufacturingPlant,
  buildUser,
  createServiceTestingModule,
  RepositoryMock,
  runAsUser,
} from '@test/utils';
import { Employee } from 'employees/entities';
import { Equipment } from 'equipments/entities';
import { Epp, EppEquipment } from './entities';
import { EppsService } from './epps.service';

const operand = (value: unknown) => (value as FindOperator<unknown>).value;
const DAY = 24 * 60 * 60 * 1000;

describe('EppsService', () => {
  let service: EppsService;
  let employees: RepositoryMock<Employee>;
  let epps: RepositoryMock<Epp>;
  let eppEquipments: RepositoryMock<EppEquipment>;
  let equipments: RepositoryMock<Equipment>;

  const user = buildUser({
    id: 10,
    manufacturingPlants: [buildManufacturingPlant({ id: 1 })],
  });
  const as = <T>(fn: () => Promise<T>) => runAsUser(user, fn);

  /** Entrega (EPP) con sus renglones de equipo. */
  const buildEpp = (
    overrides: Partial<Epp> = {},
    items: Partial<EppEquipment>[] = [{ id: 1, isActive: true }],
  ) =>
    ({
      id: 50,
      isActive: true,
      signature: 'data:image/png;base64,AAAA',
      equipments: items.map((item) => ({
        equipment: { manufacturingPlant: { id: 1 } },
        ...item,
      })),
      ...overrides,
    }) as Epp;

  beforeEach(async () => {
    const testing = await createServiceTestingModule(EppsService, {
      repositories: [Epp, Employee, EppEquipment, Equipment],
    });
    service = testing.service;
    employees = testing.repository(Employee);
    epps = testing.repository(Epp);
    eppEquipments = testing.repository(EppEquipment);
    equipments = testing.repository(Equipment);
    Object.assign(epps, {
      manager: {
        transaction: jest.fn(async (callback) =>
          callback({
            getRepository: (entity) =>
              new Map<unknown, unknown>([
                [Employee, employees],
                [Equipment, equipments],
                [Epp, epps],
                [EppEquipment, eppEquipments],
              ]).get(entity),
          }),
        ),
      },
    });
  });

  describe('assertEmployeeInUserPlants', () => {
    it('pasa si el empleado es de una planta del usuario', async () => {
      employees.exists.mockResolvedValue(true);

      await expect(
        as(() => service.assertEmployeeInUserPlants(7)),
      ).resolves.toBeUndefined();
      const [{ where }] = employees.exists.mock.calls[0] as [
        { where: { id: number; manufacturingPlants: { id: unknown } } },
      ];
      expect(where.id).toBe(7);
      expect(operand(where.manufacturingPlants.id)).toEqual([1]);
    });

    it('responde 404 si es de otra planta o no existe', async () => {
      employees.exists.mockResolvedValue(false);

      await expect(
        as(() => service.assertEmployeeInUserPlants(7)),
      ).rejects.toThrow(new NotFoundException('Empleado #7 no encontrado'));
    });

    it('un usuario sin plantas no consulta y responde 404', async () => {
      await expect(
        runAsUser(buildUser({ manufacturingPlants: [] }), () =>
          service.assertEmployeeInUserPlants(7),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(employees.exists).not.toHaveBeenCalled();
    });
  });

  describe('validateDeliveryFrequency', () => {
    const validate = () => as(() => service.validateDeliveryFrequency(3, 7));

    it('busca el equipo solo en las plantas del usuario (ajeno → 404)', async () => {
      await expect(validate()).rejects.toThrow(
        new NotFoundException('El equipo con id 3 no existe.'),
      );
      const [{ where }] = equipments.findOne.mock.calls[0] as [
        { where: { manufacturingPlant: { id: unknown } } },
      ];
      expect(operand(where.manufacturingPlant.id)).toEqual([1]);
    });

    it('sin entregas previas se puede entregar', async () => {
      equipments.findOne.mockResolvedValue({
        id: 3,
        deliveryFrequency: 30,
      } as Equipment);

      await expect(validate()).resolves.toEqual({
        canDeliver: true,
        message: 'El equipo puede ser entregado.',
      });
    });

    it('si ya pasó la frecuencia desde la última entrega se puede entregar', async () => {
      equipments.findOne.mockResolvedValue({
        id: 3,
        deliveryFrequency: 30,
      } as Equipment);
      eppEquipments.findOne.mockResolvedValue({
        deliveryDate: new Date(Date.now() - 31 * DAY),
      } as EppEquipment);

      await expect(validate()).resolves.toMatchObject({ canDeliver: true });
    });

    it('si no ha pasado la frecuencia indica los días que faltan', async () => {
      equipments.findOne.mockResolvedValue({
        id: 3,
        deliveryFrequency: 30,
      } as Equipment);
      eppEquipments.findOne.mockResolvedValue({
        deliveryDate: new Date(Date.now() - 20 * DAY),
      } as EppEquipment);

      await expect(validate()).resolves.toEqual({
        canDeliver: false,
        message:
          'El equipo no puede ser entregado. Faltan 10 día(s) para la próxima entrega.',
      });
    });

    it('sin frecuencia configurada siempre se puede entregar', async () => {
      equipments.findOne.mockResolvedValue({
        id: 3,
        deliveryFrequency: null,
      } as Equipment);
      eppEquipments.findOne.mockResolvedValue({
        deliveryDate: new Date(),
      } as EppEquipment);

      await expect(validate()).resolves.toMatchObject({ canDeliver: true });
    });
  });

  describe('create', () => {
    const dto = {
      employeeId: 7,
      signature: 'firma',
      equipments: [
        { id: 3, quantity: 1, observations: 'talla M' },
        { id: 4, quantity: 2, observations: '' },
      ],
    };
    const withFrequency = { id: 3, deliveryFrequency: 30 };
    const withoutFrequency = { id: 4, deliveryFrequency: null };

    beforeEach(() => {
      employees.findOne.mockResolvedValue({
        id: 7,
        manufacturingPlants: [{ id: 1 }],
      } as Employee);
      equipments.findOne.mockImplementation(async ({ where }) => {
        const { id } = where as { id: number };
        const base = id === 3 ? withFrequency : withoutFrequency;
        return {
          ...base,
          manufacturingPlant: { id: 1, country: { name: 'Colombia' } },
        } as never;
      });
      epps.save.mockImplementation(
        async (epp) => ({ id: 50, ...epp }) as never,
      );
    });

    it('guarda la entrega con quien la registra y un renglón por equipo', async () => {
      await expect(as(() => service.create(dto))).resolves.toEqual({
        message: 'EPP created successfully',
      });

      expect(epps.save).toHaveBeenCalledWith(
        expect.objectContaining({
          employee: expect.objectContaining({ id: 7 }),
          signature: 'firma',
          createBy: expect.objectContaining({ id: user.id }),
        }),
      );
      expect(eppEquipments.save).toHaveBeenCalledTimes(2);
      expect(eppEquipments.save).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 1,
          observations: 'talla M',
          equipment: expect.objectContaining({ id: 3 }),
          epp: expect.objectContaining({ id: 50 }),
        }),
      );
    });

    it('valida todos los equipos antes de guardar la cabecera', async () => {
      equipments.findOne.mockImplementation(async ({ where }) =>
        (where as { id: number }).id === 4
          ? null
          : ({
              ...withFrequency,
              manufacturingPlant: { id: 1, country: { name: 'México' } },
            } as never),
      );
      await expect(as(() => service.create(dto))).rejects.toThrow(
        NotFoundException,
      );
      expect(epps.save).not.toHaveBeenCalled();
      expect(eppEquipments.save).not.toHaveBeenCalled();
    });

    it('no permite equipos de una planta del usuario que no corresponda al empleado', async () => {
      equipments.findOne.mockResolvedValue({
        id: 3,
        manufacturingPlant: { id: 2, country: { name: 'Colombia' } },
      } as Equipment);
      await expect(as(() => service.create(dto))).rejects.toThrow(
        NotFoundException,
      );
      expect(epps.save).not.toHaveBeenCalled();
    });

    it('propaga el error de persistencia para revertir la transacción', async () => {
      eppEquipments.save.mockRejectedValueOnce(new Error('fallo de renglón'));
      await expect(as(() => service.create(dto))).rejects.toThrow(
        'fallo de renglón',
      );
      expect(epps.manager.transaction).toHaveBeenCalledTimes(1);
    });

    it('marca fuera de rango la entrega de un equipo antes de su frecuencia', async () => {
      eppEquipments.findOne.mockResolvedValue({
        deliveryDate: new Date(Date.now() - 5 * DAY),
      } as EppEquipment);

      await as(() => service.create(dto));

      const rows = eppEquipments.save.mock.calls.map(([row]) => row);
      expect(rows[0]).toMatchObject({ outOfRangeDelivery: true });
      // Sin frecuencia no se valida: el campo queda sin definir.
      expect(rows[1].outOfRangeDelivery).toBeUndefined();
    });

    it('dentro de la frecuencia permitida no la marca', async () => {
      await as(() => service.create(dto));

      expect(eppEquipments.save.mock.calls[0][0]).toMatchObject({
        outOfRangeDelivery: false,
      });
    });

    it('la fecha de entrega es el día local de la planta del equipo', async () => {
      await as(() => service.create(dto));

      const { deliveryDate } = eppEquipments.save.mock.calls[0][0] as {
        deliveryDate: Date;
      };
      expect(deliveryDate.getUTCHours()).toBe(0);
    });

    it('busca al empleado solo en las plantas del usuario (ajeno → 404 sin guardar)', async () => {
      employees.findOne.mockResolvedValue(null);

      await expect(as(() => service.create(dto))).rejects.toThrow(
        new NotFoundException('Employee with ID 7 not found.'),
      );
      const [{ where }] = employees.findOne.mock.calls[0] as [
        { where: { manufacturingPlants: { id: unknown } } },
      ];
      expect(operand(where.manufacturingPlants.id)).toEqual([1]);
      expect(epps.save).not.toHaveBeenCalled();
    });

    it('un equipo de otra planta o inactivo responde 404 sin guardar', async () => {
      equipments.findOne.mockResolvedValue(null);

      await expect(as(() => service.create(dto))).rejects.toThrow(
        new NotFoundException('Equipo con ID 3 no encontrado.'),
      );
      expect(epps.save).not.toHaveBeenCalled();
    });

    it('un usuario sin plantas no consulta empleados y responde 404', async () => {
      await expect(
        runAsUser(buildUser({ manufacturingPlants: [] }), () =>
          service.create(dto),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(employees.findOne).not.toHaveBeenCalled();
    });
  });

  describe('getDownloadFileName', () => {
    it('usa plantas ordenadas, código, nombre y puesto del empleado', async () => {
      employees.findOne.mockResolvedValue({
        code: 123,
        name: 'Ana Pérez',
        position: { name: 'Operador' },
        manufacturingPlants: [
          { id: 2, name: 'Manizales' },
          { id: 1, name: 'Tepotzotlán' },
        ],
      } as never);

      const name = await service.getDownloadFileName(7, 'America/Bogota');

      // Plantas ordenadas por id, sin acentos ni espacios; hora de Bogotá.
      expect(name).toMatch(
        /^EPP_Tepotzotlan\+Manizales_123_AnaPerez_Operador_\d{4}-\d{2}-\d{2}_\d{4}_UTC-05\.xlsx$/,
      );
    });

    it('sin datos del empleado igual devuelve un nombre válido', async () => {
      await expect(service.getDownloadFileName(7)).resolves.toMatch(
        /^EPP_.*\.xlsx$/,
      );
    });
  });

  describe('historial', () => {
    it('findEppsByEmployeeId deja fuera entregas y renglones inactivos', async () => {
      epps.find.mockResolvedValue([
        buildEpp({ id: 1 }, [
          { id: 10, isActive: true },
          { id: 11, isActive: false },
        ]),
        buildEpp({ id: 2, isActive: false }),
        buildEpp({ id: 3 }, [{ id: 30, isActive: false }]),
      ]);

      const result = await as(() => service.findEppsByEmployeeId(7));

      expect(result.map(({ id }) => id)).toEqual([1]);
      expect(result[0].equipments.map(({ id }) => id)).toEqual([10]);
    });

    it('findAll deja fuera a empleados sin entregas activas', async () => {
      employees.find.mockResolvedValue([
        { id: 1, epps: [buildEpp()] },
        { id: 2, epps: [buildEpp({ isActive: false })] },
      ] as never);

      const result = await service.findAll(1);

      expect(result.map(({ id }) => id)).toEqual([1]);
      const [{ where }] = employees.find.mock.calls[0] as [
        { where: { manufacturingPlants: { id: number } } },
      ];
      expect(where.manufacturingPlants.id).toBe(1);
    });
  });

  describe('findPaginated', () => {
    const qb = () => employees.queryBuilder;

    beforeEach(() => {
      qb().getManyAndCount.mockResolvedValue([
        [{ id: 1 }, { id: 2 }] as never,
        2,
      ]);
    });

    it('pagina, ordena y arma el historial de cada empleado de la página', async () => {
      epps.find.mockResolvedValue([
        { ...buildEpp({ id: 5 }), employee: { id: 1 } },
        { ...buildEpp({ id: 6 }), employee: { id: 1 } },
      ] as never);

      const result = await service.findPaginated({
        manufacturingPlantId: 1,
        page: 2,
        limit: 5,
        orderBy: 'code',
        order: 'desc',
      });

      expect(result).toMatchObject({ count: 2, page: 2, limit: 5 });
      expect(result.data[0].epps.map(({ id }) => id)).toEqual([5, 6]);
      expect(result.data[1].epps).toEqual([]);
      expect(qb().innerJoin).toHaveBeenCalledWith(
        'employee.manufacturingPlants',
        'manufacturingPlant',
        'manufacturingPlant.id = :manufacturingPlantId',
        { manufacturingPlantId: 1 },
      );
      expect(qb().orderBy).toHaveBeenCalledWith(
        'employee.code',
        'DESC',
        'NULLS LAST',
      );
      expect(qb().skip).toHaveBeenCalledWith(5);
      expect(qb().take).toHaveBeenCalledWith(5);
    });

    it('acota página y límite y ordena por nombre ascendente por defecto', async () => {
      await service.findPaginated({
        manufacturingPlantId: 1,
        page: -3,
        limit: 1000,
      });

      expect(qb().orderBy).toHaveBeenCalledWith(
        'employee.name',
        'ASC',
        'NULLS LAST',
      );
      expect(qb().skip).toHaveBeenCalledWith(0);
      expect(qb().take).toHaveBeenCalledWith(100);
    });

    it('aplica filtros de equipo, fechas, área, puesto y búsqueda (escapando comodines)', async () => {
      await service.findPaginated({
        manufacturingPlantId: 1,
        equipmentId: 3,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        areaId: 4,
        positionId: 5,
        search: ' 50%_a ',
      });

      const [existsSql, existsParams] = qb().andWhere.mock.calls[0] as [
        string,
        object,
      ];
      expect(existsSql).toContain('epp_equipment."equipmentId" = :equipmentId');
      expect(existsSql).toContain('"deliveryDate" >= :startDate');
      expect(existsSql).toContain('"deliveryDate" <= :endDate');
      expect(existsParams).toEqual({
        equipmentId: 3,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });
      expect(qb().andWhere).toHaveBeenCalledWith('area.id = :areaId', {
        areaId: 4,
      });
      expect(qb().andWhere).toHaveBeenCalledWith('position.id = :positionId', {
        positionId: 5,
      });
      expect(qb().andWhere).toHaveBeenCalledWith(expect.any(Brackets), {
        term: '%50\\%\\_a%',
      });
    });

    it('sin filtros opcionales no los agrega', async () => {
      await service.findPaginated({ manufacturingPlantId: 1 });

      const [existsSql, existsParams] = qb().andWhere.mock.calls[0] as [
        string,
        object,
      ];
      expect(existsSql).not.toContain(':equipmentId');
      expect(existsParams).toEqual({});
      expect(qb().andWhere).toHaveBeenCalledTimes(1);
    });

    it('sin empleados en la página no consulta el historial', async () => {
      qb().getManyAndCount.mockResolvedValue([[], 0]);

      await expect(
        service.findPaginated({ manufacturingPlantId: 1 }),
      ).resolves.toMatchObject({ data: [], count: 0 });
      expect(epps.find).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('busca la entrega solo entre empleados de las plantas del usuario', async () => {
      epps.findOne.mockResolvedValue(buildEpp());

      await expect(as(() => service.findOne(50))).resolves.toMatchObject({
        id: 50,
      });
      const [{ where }] = epps.findOne.mock.calls[0] as [
        { where: { employee: { manufacturingPlants: { id: unknown } } } },
      ];
      expect(operand(where.employee.manufacturingPlants.id)).toEqual([1]);
    });

    it('una entrega de otra planta o inexistente responde 404', async () => {
      await expect(as(() => service.findOne(50))).rejects.toThrow(
        new NotFoundException('EPP with ID 50 not found.'),
      );
    });
  });

  describe('removeHistory', () => {
    it('borra la entrega completa y todos sus renglones', async () => {
      eppEquipments.findOne.mockResolvedValue({
        id: 9,
        epp: { id: 50, equipments: [] },
      } as EppEquipment);

      await expect(as(() => service.removeHistory(9))).resolves.toEqual({
        message:
          'Registro eliminado correctamente. Se borraron el EPP y su historial relacionado.',
      });
      expect(eppEquipments.queryBuilder.where).toHaveBeenCalledWith(
        '"eppId" = :eppId',
        { eppId: 50 },
      );
      expect(eppEquipments.queryBuilder.execute).toHaveBeenCalled();
      expect(epps.delete).toHaveBeenCalledWith(50);
    });

    it('un renglón de otra planta o inexistente responde 404 sin borrar', async () => {
      await expect(as(() => service.removeHistory(9))).rejects.toThrow(
        new NotFoundException('Registro de historial con ID 9 no encontrado.'),
      );
      const [{ where }] = eppEquipments.findOne.mock.calls[0] as [
        {
          where: {
            epp: { employee: { manufacturingPlants: { id: unknown } } };
          };
        },
      ];
      expect(operand(where.epp.employee.manufacturingPlants.id)).toEqual([1]);
      expect(epps.delete).not.toHaveBeenCalled();
    });
  });
});
