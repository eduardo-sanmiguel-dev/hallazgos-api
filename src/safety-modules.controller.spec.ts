import { buildAdmin } from '../test/utils/index.js';
/**
 * Contrato HTTP de brigadas (equipos de emergencia), ICS y reglas de vida.
 */
import {
  createHttpTestApp,
  describeCrudContract,
  mockProvider,
} from '../test/utils/index.js';
import { EmergencyTeamsController } from './emergency-teams/emergency-teams.controller.js';
import { EmergencyTeamsService } from './emergency-teams/emergency-teams.service.js';
import { IcsController } from './ics/ics.controller.js';
import { IcsService } from './ics/ics.service.js';
import { RulesOfLifeController } from './rules-of-life/rules-of-life.controller.js';
import { RulesOfLifeService } from './rules-of-life/rules-of-life.service.js';

const team = {
  location: 'Almacén norte',
  extinguisherNumber: 'E-12',
  typeOfExtinguisher: 'CO2',
  capacity: 4.5,
  manufacturingPlantId: 1,
};

describeCrudContract({
  user: buildAdmin(),
  path: '/emergency-teams',
  controller: EmergencyTeamsController,
  service: EmergencyTeamsService,
  create: {
    valid: team,
    invalid: [
      ['con ubicación muy corta', { ...team, location: 'A' }],
      [
        'con tipo de extintor desconocido',
        { ...team, typeOfExtinguisher: 'Agua' },
      ],
    ],
  },
  list: {
    query: { search: 'E-1', manufacturingPlantId: '1' },
    expected: { search: 'E-1', manufacturingPlantId: 1 },
  },
  findOne: true,
  update: { valid: { location: 'Patio trasero' } },
  remove: true,
});

describe('IcsController (HTTP)', () => {
  it('POST convierte los campos del formulario y la lista de empleados', async () => {
    const http = await createHttpTestApp({
      user: buildAdmin(),
      controllers: [IcsController],
      providers: [mockProvider(IcsService)],
    });
    const service = http.get(IcsService);

    await http
      .http()
      .post('/ics')
      .field({
        totalPeople: '8',
        manufacturingPlantId: '1',
        ruleOfLifeId: '2',
        'employeesIds[0]': '5',
        'employeesIds[1]': '6',
      })
      .expect(201);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ totalPeople: 8, employeesIds: [5, 6] }),
      undefined,
    );

    await http
      .http()
      .post('/ics')
      .field({ totalPeople: '8', manufacturingPlantId: '1', ruleOfLifeId: '2' })
      .expect(400);

    await http.http().get('/ics/catalogs').expect(200);
    expect(service.catalogs).toHaveBeenCalled();
    expect(service.findOne).not.toHaveBeenCalled();

    await http
      .http()
      .get('/ics')
      .query({ name: 'epp', page: 1, limit: 10 })
      .expect(200);
    expect(service.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'epp', page: 1, limit: 10 }),
    );

    await http.http().get('/ics/4').expect(200);
    expect(service.findOne).toHaveBeenCalledWith(4);
    await http.http().delete('/ics/4').expect(200);
    expect(service.remove).toHaveBeenCalledWith(4);
    await http.close();
  });
});

describe('RulesOfLifeController (HTTP)', () => {
  it('POST seed ejecuta la carga de datos', async () => {
    const http = await createHttpTestApp({
      user: buildAdmin(),
      controllers: [RulesOfLifeController],
      providers: [mockProvider(RulesOfLifeService)],
    });
    const service = http.get(RulesOfLifeService);
    service.seed.mockResolvedValue({ message: 'Seeded successfully' });

    await http
      .http()
      .post('/rules-of-life/seed')
      .expect(201, { message: 'Seeded successfully' });
    await http.close();
  });
});
