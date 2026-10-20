import {
  createHttpTestApp,
  describeCrudContract,
  mockProvider,
} from '@test/utils';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const valid = {
  name: 'Ana',
  email: 'ana@hallazgos.test',
  password: 'Clave-1',
  rule: 'General',
  manufacturingPlantNames: ['Tepotzotlán'],
};

describeCrudContract({
  path: '/users',
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
    query: { orderBy: 'name|asc' },
    invalid: [['ordenando por contraseña', { orderBy: 'password|asc' }]],
  },
  findOne: true,
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
