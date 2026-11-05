import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, type ObjectLiteral } from 'typeorm';
import { buildAdmin, buildUser, runAsUser } from '../../test/utils/index.js';
import { RequestContextService } from '../shared/services/request-context.service.js';
import { CatalogLifecycleService } from './catalog-lifecycle.service.js';

// PostgreSQL query behavior is covered in test/db/catalog-lifecycle.db-spec.ts.
// These tests isolate authorization and the reactivation policy, including failure paths.
describe('CatalogLifecycleService', () => {
  const plant = { id: 1, isActive: true };
  const admin = buildAdmin({ id: 77, manufacturingPlants: [plant] as never });
  let service: CatalogLifecycleService;
  let row: ObjectLiteral;
  let repository: ReturnType<typeof makeRepository>;
  let query: { where: jest.Mock; andWhere: jest.Mock; getExists: jest.Mock };
  let database: { transaction: jest.Mock };
  function makeRepository() {
    return {
      findOne: jest.fn().mockResolvedValue({ id: 9 }),
      findOneOrFail: jest.fn().mockImplementation(async () => row),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockImplementation(() => query),
      metadata: {
        relations: [] as { propertyName: string }[],
        findRelationWithPropertyPath: jest.fn().mockReturnValue(undefined),
      },
    };
  }
  const activate = (catalog = 'main-types') =>
    runAsUser(admin, () => service.activate(catalog, 9));
  beforeEach(() => {
    row = { id: 9, isActive: false };
    query = {
      where: jest.fn(),
      andWhere: jest.fn(),
      getExists: jest.fn().mockResolvedValue(false),
    };
    query.where.mockReturnValue(query);
    query.andWhere.mockReturnValue(query);
    repository = makeRepository();
    database = {
      transaction: jest.fn(async (work) =>
        work({ getRepository: () => repository }),
      ),
    };
    service = new CatalogLifecycleService(
      database as unknown as DataSource,
      new RequestContextService(),
    );
  });
  it('rechaza a un usuario general antes de abrir una transacción', async () => {
    await expect(
      runAsUser(buildUser(), () => service.activate('main-types', 9)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.transaction).not.toHaveBeenCalled();
  });
  it.each(['evidences', '__proto__', 'constructor'])(
    'rechaza el catálogo no permitido %s',
    async (catalog) => {
      await expect(activate(catalog)).rejects.toBeInstanceOf(NotFoundException);
      expect(database.transaction).not.toHaveBeenCalled();
    },
  );
  it('un registro inexistente no se actualiza', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(activate()).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.update).not.toHaveBeenCalled();
  });
  it('reactiva bajo reserva transaccional sin cambiar otros datos', async () => {
    await expect(activate()).resolves.toEqual({ id: 9, isActive: true });
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 9 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(repository.update).toHaveBeenCalledWith(9, { isActive: true });
  });
  it('registra el actor cuando la entidad soporta updatedBy', async () => {
    repository.metadata.findRelationWithPropertyPath.mockReturnValue({});
    await activate();
    expect(repository.update).toHaveBeenCalledWith(9, {
      isActive: true,
      updatedBy: { id: 77 },
    });
  });
  it('un registro ya activo es idempotente', async () => {
    row.isActive = true;
    await expect(activate()).resolves.toEqual({ id: 9, isActive: true });
    expect(repository.update).not.toHaveBeenCalled();
  });
  it('no reactiva un registro de una planta ajena', async () => {
    row.manufacturingPlant = { id: 2, isActive: true };
    await expect(activate('equipments')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.update).not.toHaveBeenCalled();
  });
  it('no reactiva registros sin ninguna planta dentro de sus permisos', async () => {
    row.manufacturingPlants = [{ id: 2, isActive: true }];
    await expect(activate('users')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('una planta inactiva impide reactivar su registro', async () => {
    row.manufacturingPlant = { ...plant, isActive: false };
    await expect(activate('equipments')).rejects.toThrow(
      'reactivar primero la planta',
    );
  });
  it('un usuario necesita una planta activa y permitida', async () => {
    row.manufacturingPlants = [
      { ...plant, isActive: false },
      { id: 2, isActive: true },
    ];
    await expect(activate('users')).rejects.toBeInstanceOf(BadRequestException);
    row.manufacturingPlants = [plant];
    await expect(activate('users')).resolves.toEqual({ id: 9, isActive: true });
  });
  it.each([null, { isActive: false }])(
    'un criterio padre no disponible impide reactivar un tipo',
    async (mainType) => {
      row.mainType = mainType;
      await expect(activate('secondary-types')).rejects.toThrow(
        'criterio principal',
      );
      expect(repository.update).not.toHaveBeenCalled();
    },
  );
  it('permite reactivar el tipo con criterio principal activo', async () => {
    row.mainType = { isActive: true };
    await activate('secondary-types');
    expect(repository.update).toHaveBeenCalled();
  });
  it.each(['area', 'position', 'gender'])(
    'un colaborador no puede reactivarse con %s inactivo',
    async (dependency) => {
      repository.metadata.relations = [{ propertyName: dependency }];
      row[dependency] = { isActive: false };
      await expect(activate('employees')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.update).not.toHaveBeenCalled();
    },
  );
  it('permite colaboradores con sus catálogos activos', async () => {
    repository.metadata.relations = [
      'area',
      'position',
      'gender',
      'manufacturingPlants',
      'ics',
    ].map((propertyName) => ({ propertyName }));
    Object.assign(row, {
      area: { isActive: true },
      position: { isActive: true },
      gender: { isActive: true },
      manufacturingPlants: [plant],
    });
    await activate('employees');
    expect(repository.update).toHaveBeenCalled();
  });
  it('el lugar debe tener un área de su misma planta', async () => {
    Object.assign(row, {
      manufacturingPlant: plant,
      area: { isActive: true, manufacturingPlant: { id: 2 } },
    });
    repository.metadata.relations = [{ propertyName: 'area' }];
    await expect(activate('zones')).rejects.toThrow('no pertenece');
    row.area.manufacturingPlant = plant;
    await activate('zones');
    expect(repository.update).toHaveBeenCalled();
  });
  const observer = () => {
    repository.metadata.relations = [
      { propertyName: 'gembaWalkZone' },
      { propertyName: 'user' },
    ];
    Object.assign(row, {
      manufacturingPlant: plant,
      gembaWalkZone: { id: 3, isActive: true, manufacturingPlant: plant },
      user: { id: 5, isActive: true, manufacturingPlants: [plant] },
    });
  };
  it('un observador necesita su zona activa', async () => {
    observer();
    row.gembaWalkZone.isActive = false;
    await expect(activate('gemba-walk-observers')).rejects.toThrow(
      'zona Gemba Walk',
    );
  });
  it('un observador necesita su usuario activo', async () => {
    observer();
    row.user.isActive = false;
    await expect(activate('gemba-walk-observers')).rejects.toThrow(
      'usuario observador',
    );
  });
  it.each(['zone', 'user'])(
    'un observador con %s de otra planta es rechazado',
    async (dependency) => {
      observer();
      if (dependency === 'zone')
        row.gembaWalkZone.manufacturingPlant = { id: 2 };
      else row.user.manufacturingPlants = [{ id: 2 }];
      await expect(activate('gemba-walk-observers')).rejects.toThrow(
        'pertenecer a la planta',
      );
      expect(repository.update).not.toHaveBeenCalled();
    },
  );
  it('reactiva un observador válido', async () => {
    observer();
    await activate('gemba-walk-observers');
    expect(repository.update).toHaveBeenCalled();
  });
  it('un evento pasado no se reactiva', async () => {
    row.scheduledAt = new Date(0);
    await expect(activate('gemba-walk-calendar')).rejects.toThrow(
      'evento pasado',
    );
  });
  it('reactiva un evento futuro usando la planta de la zona', async () => {
    row.scheduledAt = new Date(Date.now() + 86400000);
    row.gembaWalkZone = { id: 3, isActive: true, manufacturingPlant: plant };
    await activate('gemba-walk-calendar');
    expect(repository.update).toHaveBeenCalled();
  });
  it.each(['areas', 'gemba-walk-zones', 'gemba-walk-evaluations'])(
    'no reactiva %s si ya existe uno equivalente activo',
    async (catalog) => {
      Object.assign(row, {
        manufacturingPlant: plant,
        name: 'Zona',
        nameZone: 'Zona',
        nameLocation: 'Ubicación',
        area: 'EPP',
        category: 'SHE',
      });
      query.getExists.mockResolvedValue(true);
      await expect(activate(catalog)).rejects.toBeInstanceOf(ConflictException);
      expect(repository.update).not.toHaveBeenCalled();
    },
  );
  it('un error de unicidad concurrente se comunica como conflicto', async () => {
    repository.update.mockRejectedValue({ code: '23505' });
    await expect(activate()).rejects.toBeInstanceOf(ConflictException);
  });
  it('propaga los fallos de base de datos para que la transacción revierta', async () => {
    const failure = new Error('Conexión interrumpida');
    repository.update.mockRejectedValue(failure);
    await expect(activate()).rejects.toBe(failure);
  });
});
