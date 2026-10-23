import {
  buildAdmin,
  createHttpTestApp,
  describeCrudContract,
  mockProvider,
} from '../../test/utils/index.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

const valid = {
  name: 'Ana',
  email: 'ana@hallazgos.test',
  password: 'Clave-1',
  rule: 'General',
  manufacturingPlantNames: ['Tepotzotlán'],
};

describeCrudContract({
  path: '/users',
  user: buildAdmin(),
  controller: UsersController,
  service: UsersService,
  create: {
    valid,
    invalid: [
      ['sin contraseña', { ...valid, password: '' }],
      ['sin plantas', { ...valid, manufacturingPlantNames: [] }],
    ],
  },
  list: {
    method: 'findAllForRequest',
    query: { orderBy: 'name|asc' },
    invalid: [['ordenando por contraseña', { orderBy: 'password|asc' }]],
  },
  findOne: { method: 'findOneForRequest' },
  update: {
    valid: { manufacturingPlantNames: ['Tepotzotlán'] },
    invalid: [['sin plantas', { name: 'Ana' }]],
  },
  remove: true,
});

describe('UsersController: rutas fijas', () => {
  it('get-information-current-user y supervisors no se confunden con /:id', async () => {
    const http = await createHttpTestApp({
      controllers: [UsersController],
      providers: [mockProvider(UsersService)],
    });
    const service = http.get(UsersService);

    await http.http().get('/users/get-information-current-user').expect(200);
    await http.http().get('/users/supervisors').expect(200);

    expect(service.getInformationCurrentUser).toHaveBeenCalled();
    expect(service.getSupervisors).toHaveBeenCalled();
    expect(service.findOne).not.toHaveBeenCalled();
    await http.close();
  });
});

describe('UsersController: GET /users/supervisors', () => {
  let http: Awaited<ReturnType<typeof createHttpTestApp>>;
  let service: jest.Mocked<UsersService>;

  beforeAll(async () => {
    http = await createHttpTestApp({
      controllers: [UsersController],
      providers: [mockProvider(UsersService)],
    });
    service = http.get(UsersService);
  });

  afterAll(() => http.close());
  beforeEach(() => jest.clearAllMocks());

  it('con planta y zona pide solo los supervisores de esa zona', async () => {
    service.getZoneSupervisors.mockResolvedValue([{ id: 5 }] as never);

    await http
      .http()
      .get('/users/supervisors')
      .query({ manufacturingPlantId: 1, zoneId: 10 })
      .expect(200, [{ id: 5 }]);

    expect(service.getZoneSupervisors).toHaveBeenCalledWith(1, 10);
    expect(service.getSupervisors).not.toHaveBeenCalled();
  });

  it.each([
    ['zona sin planta', { zoneId: 10 }],
    ['planta sin zona', { manufacturingPlantId: 1 }],
    ['ids no numéricos', { manufacturingPlantId: 'x', zoneId: 10 }],
  ])('responde 400 con %s', async (_c, query) => {
    await http.http().get('/users/supervisors').query(query).expect(400);

    expect(service.getZoneSupervisors).not.toHaveBeenCalled();
    expect(service.getSupervisors).not.toHaveBeenCalled();
  });
});

describe('UsersController: permisos de escritura', () => {
  it.each(['General', 'Supervisor'])(
    'rechaza POST, PATCH y DELETE para %s sin invocar escrituras',
    async (role) => {
      const http = await createHttpTestApp({
        controllers: [UsersController],
        providers: [mockProvider(UsersService)],
        user: buildAdmin({ role }),
      });
      const service = http.get(UsersService);
      try {
        await http.http().post('/users').send(valid).expect(403);
        await http.http().patch('/users/7').send(valid).expect(403);
        await http.http().delete('/users/7').expect(403);
        expect(service.create).not.toHaveBeenCalled();
        expect(service.update).not.toHaveBeenCalled();
        expect(service.remove).not.toHaveBeenCalled();
      } finally {
        await http.close();
      }
    },
  );
});
