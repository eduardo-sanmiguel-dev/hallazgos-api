import { ConflictException, NotFoundException } from '@nestjs/common';
import { FindOperator } from 'typeorm';

import {
  buildManufacturingPlant,
  buildUser,
  createServiceTestingModule,
  type RepositoryMock,
  runAsUser,
} from '../../test/utils/index.js';
import { Genre } from '../genres/entities/genre.entity.js';
import { Zone } from '../zones/entities/zone.entity.js';
import { Employee, EmployeeArea, EmployeePosition } from './entities/index.js';
import { EmployeesService } from './employees.service.js';

describe('EmployeesService', () => {
  let service: EmployeesService;
  let employees: RepositoryMock<Employee>;
  let areas: RepositoryMock<EmployeeArea>;
  let positions: RepositoryMock<EmployeePosition>;
  let genres: RepositoryMock<Genre>;

  const tepotzotlan = buildManufacturingPlant({ id: 1, name: 'Tepotzotlán' });
  const manizales = buildManufacturingPlant({ id: 2, name: 'Manizales' });
  const user = buildUser({ manufacturingPlants: [tepotzotlan, manizales] });
  const as = <R>(fn: () => R): Promise<Awaited<R>> =>
    runAsUser(user, fn as () => Promise<Awaited<R>>);

  const dto = {
    code: 123,
    name: 'Ana Pérez',
    birthdate: new Date('1990-01-01'),
    dateOfAdmission: new Date('2024-01-01'),
    areaId: 4,
    positionId: 5,
    genderId: 6,
    manufacturingPlantsIds: [1, 3],
  };

  beforeEach(async () => {
    const testing = await createServiceTestingModule(EmployeesService, {
      repositories: [Employee, Zone, EmployeeArea, EmployeePosition, Genre],
    });
    service = testing.service;
    employees = testing.repository(Employee);
    areas = testing.repository(EmployeeArea);
    positions = testing.repository(EmployeePosition);
    genres = testing.repository(Genre);

    for (const repo of [areas, positions, genres]) {
      (repo.findOne as jest.Mock).mockImplementation(async ({ where }) => ({
        id: where.id,
      }));
    }
  });

  describe('catálogos', () => {
    it('devuelve áreas, puestos y géneros activos, y las plantas del usuario ordenadas', async () => {
      areas.find.mockResolvedValue([{ id: 1 }] as EmployeeArea[]);

      const catalogs = await as(() => service.findCatalogs());

      expect(catalogs.areas).toEqual([{ id: 1 }]);
      expect(catalogs.manufacturingPlants.map(({ name }) => name)).toEqual([
        'Manizales',
        'Tepotzotlán',
      ]);
      expect(areas.find).toHaveBeenCalledWith({
        where: { isActive: true },
        order: { name: 'ASC' },
      });
      await service.findPositions();
      expect(positions.find).toHaveBeenCalled();
    });

    it('sin sesión no hay plantas', async () => {
      await expect(
        runAsUser(null, () => service.findCatalogs()),
      ).resolves.toMatchObject({ manufacturingPlants: [] });
    });
  });

  describe('create', () => {
    it('guarda el empleado solo con las plantas del usuario', async () => {
      await as(() => service.create(dto));

      expect(employees.create).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 123,
          area: { id: 4 },
          position: { id: 5 },
          gender: { id: 6 },
          manufacturingPlants: [tepotzotlan],
        }),
      );
      expect(employees.save).toHaveBeenCalled();
    });

    it.each([
      ['área', () => areas, 'Área con id 4 no encontrado'],
      ['puesto', () => positions, 'Puesto con id 5 no encontrado'],
      ['género', () => genres, 'Género con id 6 no encontrado'],
    ])(
      'un %s inexistente responde 404 (antes se guardaba vacío)',
      async (_c, repo, message) => {
        repo().findOne.mockResolvedValue(null);

        await expect(as(() => service.create(dto))).rejects.toThrow(
          new NotFoundException(message),
        );
        expect(employees.save).not.toHaveBeenCalled();
      },
    );

    it('un código repetido responde 409 con un mensaje claro', async () => {
      employees.save.mockRejectedValue({ code: '23505' });

      await expect(as(() => service.create(dto))).rejects.toThrow(
        new ConflictException(
          'Ya existe un empleado con el código 123. Si no aparece en la lista, puede estar inactivo.',
        ),
      );
    });

    it('otros errores de la base se propagan', async () => {
      const error = new Error('conexión perdida');
      employees.save.mockRejectedValue(error);

      await expect(as(() => service.create(dto))).rejects.toBe(error);
    });
  });

  describe('findAll', () => {
    const findArgs = () =>
      employees.find.mock.calls[0][0] as {
        where: Record<string, unknown>[];
        order: object;
      };
    const plantIds = (where: Record<string, unknown>) =>
      (where.manufacturingPlants as { id: FindOperator<number[]> }).id.value;

    it('sin filtros: activos de las plantas del usuario, por nombre', async () => {
      await as(() => service.findAll({}));

      const { where, order } = findArgs();
      expect(where).toHaveLength(1);
      expect(where[0].isActive).toBe(true);
      expect(plantIds(where[0])).toEqual([1, 2]);
      expect(order).toEqual({ name: 'ASC' });
    });

    it('con una planta propia filtra por ella', async () => {
      await as(() => service.findAll({ manufacturingPlantId: 2 }));

      expect(plantIds(findArgs().where[0])).toEqual([2]);
    });

    it('con una planta ajena no devuelve nada ni consulta (antes listaba esa planta)', async () => {
      await expect(
        as(() => service.findAll({ manufacturingPlantId: 9 })),
      ).resolves.toEqual([]);
      await expect(
        as(() =>
          service.findAll({ manufacturingPlantId: 9, page: 1, limit: 10 }),
        ),
      ).resolves.toEqual({ data: [], count: 0 });
      expect(employees.find).not.toHaveBeenCalled();
      expect(employees.findAndCount).not.toHaveBeenCalled();
    });

    it('filtra por puesto, área, género y estado', async () => {
      await as(() =>
        service.findAll({
          positionId: 5,
          areaId: 4,
          genreId: 6,
          isActive: 'false',
        }),
      );

      expect(findArgs().where[0]).toMatchObject({
        isActive: false,
        position: { id: 5 },
        area: { id: 4 },
        gender: { id: 6 },
      });
    });

    it('isActive "true" e inválido se tratan como activos', async () => {
      await as(() => service.findAll({ isActive: 'true' }));
      await as(() => service.findAll({ isActive: 'x' }));

      expect(
        (employees.find.mock.calls[1][0] as { where: { isActive: boolean }[] })
          .where[0].isActive,
      ).toBe(true);
    });

    it('busca por nombre o por número de empleado', async () => {
      await as(() => service.findAll({ name: ' 12 ' }));

      const [byName, byCode] = findArgs().where as {
        name?: FindOperator<string>;
        code?: FindOperator<string>;
      }[];
      expect(byName.name.value).toBe('%12%');
      expect(byCode.code.getSql('c')).toBe('CAST(c AS TEXT) ILIKE :code');
    });

    it('paginado aplica skip/take; limit -1 trae todo', async () => {
      employees.findAndCount.mockResolvedValue([[], 0]);

      await as(() => service.findAll({ page: 3, limit: 10 }));
      await as(() => service.findAll({ page: 1, limit: -1 }));

      expect(employees.findAndCount.mock.calls[0][0]).toMatchObject({
        take: 10,
        skip: 20,
      });
      expect(employees.findAndCount.mock.calls[1][0]).not.toHaveProperty(
        'take',
      );
    });
  });

  describe('findOne y puestos', () => {
    it('un empleado inexistente o inactivo responde 404', async () => {
      await expect(as(() => service.findOne(7))).rejects.toThrow(
        new NotFoundException('Employee with id 7 not found'),
      );
    });

    it('findPositionById responde 404 si no existe', async () => {
      positions.findOne.mockResolvedValue(null);

      await expect(service.findPositionById(5)).rejects.toThrow(
        new NotFoundException('Position with id 5 not found'),
      );
    });

    it('findPositionById devuelve el puesto', async () => {
      await expect(service.findPositionById(5)).resolves.toEqual({ id: 5 });
    });
  });

  describe('update', () => {
    const current = () =>
      ({
        id: 7,
        code: 123,
        name: 'Ana',
        area: { id: 40 },
        position: { id: 50 },
        gender: { id: 60 },
        manufacturingPlants: [manizales],
      }) as unknown as Employee;

    beforeEach(() => {
      employees.findOne.mockResolvedValue(current());
      employees.save.mockImplementation(async (e) => e as never);
    });

    it('cambia solo lo enviado y conserva el resto (antes asignaba cualquier área)', async () => {
      const result = await as(() => service.update(7, { name: 'Ana María' }));

      expect(result).toMatchObject({
        name: 'Ana María',
        code: 123,
        area: { id: 40 },
        position: { id: 50 },
        gender: { id: 60 },
        manufacturingPlants: [manizales],
      });
      expect(areas.findOne).not.toHaveBeenCalled();
    });

    it('con datos completos reemplaza catálogos y plantas (solo las del usuario)', async () => {
      const result = await as(() => service.update(7, dto));

      expect(result).toMatchObject({
        area: { id: 4 },
        manufacturingPlants: [tepotzotlan],
      });
    });

    it('un área inexistente responde 404', async () => {
      areas.findOne.mockResolvedValue(null);

      await expect(as(() => service.update(7, { areaId: 99 }))).rejects.toThrow(
        new NotFoundException('Área con id 99 no encontrado'),
      );
    });

    it('un código repetido responde 409', async () => {
      employees.save.mockRejectedValue({ code: '23505' });

      await expect(
        as(() => service.update(7, { code: 5 })),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it('remove desactiva al empleado existente', async () => {
    employees.findOne.mockResolvedValue({ id: 7 } as Employee);

    await as(() => service.remove(7));

    expect(employees.save).toHaveBeenCalledWith({ id: 7, isActive: false });
  });
});
