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
