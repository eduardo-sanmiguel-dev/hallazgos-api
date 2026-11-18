import {
  createServiceTestingModule,
  type RepositoryMock,
} from '../../test/utils/index.js';
import {
  AreaOfBehavior,
  RulesOfLife,
  StandardOfBehavior,
} from './entities/index.js';
import { RulesOfLifeService } from './rules-of-life.service.js';

describe('RulesOfLifeService.seed', () => {
  let service: RulesOfLifeService;
  let rules: RepositoryMock<RulesOfLife>;
  let standards: RepositoryMock<StandardOfBehavior>;
  let areas: RepositoryMock<AreaOfBehavior>;
  // "Tabla" de áreas para simular la base entre llamadas.
  let storedAreas: string[];

  beforeEach(async () => {
    const testing = await createServiceTestingModule(RulesOfLifeService, {
      repositories: [RulesOfLife, StandardOfBehavior, AreaOfBehavior],
    });
    service = testing.service;
    rules = testing.repository(RulesOfLife);
    standards = testing.repository(StandardOfBehavior);
    areas = testing.repository(AreaOfBehavior);

    storedAreas = [];
    areas.save.mockImplementation(async (area) => {
      storedAreas.push((area as AreaOfBehavior).name);
      return area as never;
    });
    areas.findOne.mockImplementation(async ({ where }) =>
      storedAreas.includes((where as { name: string }).name)
        ? ({ name: (where as { name: string }).name } as AreaOfBehavior)
        : null,
    );
  });

  it('carga las 18 áreas, las 8 reglas de vida y sus estándares', async () => {
    await expect(service.seed()).resolves.toEqual({
      message: 'Catálogo de reglas de vida cargado.',
    });

    expect(storedAreas).toHaveLength(18);
    expect(rules.save).toHaveBeenCalledTimes(8);
    expect(rules.create).toHaveBeenCalledWith({
      name: 'Seguridad como valor vital',
      order: 1,
    });
    expect(standards.save).toHaveBeenCalledTimes(11);
  });

  // BUG pendiente: POST /rules-of-life/seed está expuesto y cada llamada
  // vuelve a insertar las áreas y reglas (duplicados).
  it.failing('volver a ejecutarlo no duplica datos', async () => {
    await service.seed();
    await service.seed();

    expect(storedAreas).toHaveLength(18);
    expect(rules.save).toHaveBeenCalledTimes(8);
  });
});

describe('RulesOfLifeService (stubs y áreas faltantes)', () => {
  const setup = async () => {
    const testing = await createServiceTestingModule(RulesOfLifeService, {
      repositories: [RulesOfLife, StandardOfBehavior, AreaOfBehavior],
    });
    return {
      service: testing.service,
      areas: testing.repository(AreaOfBehavior),
    };
  };

  it('crea el área de un estándar si no existe al consultarla', async () => {
    const { service, areas } = await setup();
    // findOne devuelve null (área no encontrada) por defecto.

    await service.seed();

    // 18 de la carga inicial + las de cada estándar que no se encontraron.
    expect(areas.save.mock.calls.length).toBeGreaterThan(18);
    expect(areas.create).toHaveBeenCalledWith({ name: 'Bodegas' });
  });

  it('create, findAll, findOne, update y remove son stubs sin acceso a datos', async () => {
    const { service, areas } = await setup();

    expect(service.create({} as never)).toEqual({});
    expect(service.findAll()).toEqual(expect.any(String));
    expect(service.findOne(3)).toContain('#3');
    expect(service.update(3, {} as never)).toEqual({
      id: 3,
      updateRulesOfLifeDto: {},
    });
    expect(service.remove(3)).toContain('#3');
    expect(areas.find).not.toHaveBeenCalled();
  });
});
