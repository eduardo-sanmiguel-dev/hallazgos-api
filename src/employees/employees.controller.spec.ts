import {
  createHttpTestApp,
  describeCrudContract,
  mockProvider,
} from '../../test/utils/index.js';
import { EmployeesController } from './employees.controller.js';
import { EmployeesService } from './employees.service.js';

const valid = {
  code: 123,
  name: 'Ana Pérez',
  birthdate: '1990-01-01',
  dateOfAdmission: '2024-01-01',
  areaId: 4,
  positionId: 5,
  genderId: 6,
  manufacturingPlantsIds: [1],
};

describeCrudContract({
  path: '/employees',
  controller: EmployeesController,
  service: EmployeesService,
  create: {
    valid,
    expected: { code: 123, name: 'Ana Pérez', manufacturingPlantsIds: [1] },
    invalid: [
      ['sin plantas', { ...valid, manufacturingPlantsIds: [] }],
      ['con una fecha inválida', { ...valid, birthdate: 'ayer' }],
      ['con código de texto', { ...valid, code: 'abc' }],
    ],
  },
  list: {
    query: {
      manufacturingPlantId: '1',
      isActive: 'false',
      page: '1',
      limit: '-1',
      view: 'options',
    },
    expected: {
      manufacturingPlantId: 1,
      isActive: 'false',
      page: 1,
      limit: -1,
      view: 'options',
    },
    invalid: [
      ['con isActive no booleano', { isActive: 'quizas' }],
      ['con una view desconocida', { view: 'todo' }],
    ],
  },
  findOne: true,
  update: { valid: { name: 'Ana María' } },
  remove: true,
});

describe('EmployeesController: catálogos', () => {
  it('GET catalogs y positions no se confunden con /:id', async () => {
    const http = await createHttpTestApp({
      controllers: [EmployeesController],
      providers: [mockProvider(EmployeesService)],
    });
    const service = http.get(EmployeesService);
    service.findCatalogs.mockResolvedValue({ areas: [] } as never);
    service.findPositions.mockResolvedValue([]);

    await http.http().get('/employees/catalogs').expect(200, { areas: [] });
    await http.http().get('/employees/positions').expect(200, []);
    expect(service.findOne).not.toHaveBeenCalled();
    await http.close();
  });

  it('POST create convierte las fechas a Date', async () => {
    const http = await createHttpTestApp({
      controllers: [EmployeesController],
      providers: [mockProvider(EmployeesService)],
    });
    const service = http.get(EmployeesService);

    await http.http().post('/employees').send(valid).expect(201);

    expect(service.create.mock.calls[0][0].birthdate).toBeInstanceOf(Date);
    await http.close();
  });
});
