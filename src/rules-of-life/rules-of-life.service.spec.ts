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
      message: 'Seeded successfully',
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
