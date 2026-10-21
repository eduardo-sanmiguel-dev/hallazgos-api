import {
  buildManufacturingPlant,
  buildUser,
  createHttpTestApp,
  type HttpTestApp,
  mockProvider,
} from '../../test/utils/index.js';
import { EquipmentsController } from './equipments.controller.js';
import { EquipmentsService } from './equipments.service.js';

describe('EquipmentsController (HTTP)', () => {
  let http: HttpTestApp;
  let service: jest.Mocked<EquipmentsService>;

  beforeAll(async () => {
    http = await createHttpTestApp({
      controllers: [EquipmentsController],
      providers: [mockProvider(EquipmentsService)],
      user: buildUser({
        manufacturingPlants: [buildManufacturingPlant({ id: 1 })],
      }),
    });
    service = http.get(EquipmentsService);
  });

  afterAll(() => http.close());

  beforeEach(() => jest.clearAllMocks());

  it('POST seed y GET :id', async () => {
    await http.http().post('/equipments/seed').expect(201);
    expect(service.seed).toHaveBeenCalled();

    await http.http().get('/equipments/5').expect(200);
    expect(service.findOne).toHaveBeenCalledWith(5);
  });

  it('DELETE :id desactiva con el id numérico', async () => {
    await http.http().delete('/equipments/5').expect(200);

    expect(service.remove).toHaveBeenCalledWith(5);
  });

  it('GET lista: sin planta usa las del usuario; con page y limit pagina', async () => {
    await http.http().get('/equipments').query({ name: 'cas' }).expect(200);
    expect(service.findAll).toHaveBeenCalledWith(undefined, 'cas');

    await http
      .http()
      .get('/equipments')
      .query({ manufacturingPlantId: '1', page: '2', limit: '5' })
      .expect(200);
    expect(service.findAllPaginated).toHaveBeenCalledWith(1, '', '2', '5');

    await http
      .http()
      .get('/equipments')
      .query({ manufacturingPlantId: '2' })
      .expect(404);
  });

  it('POST crea en la planta propia y PATCH conserva la planta si no llega', async () => {
    await http
      .http()
      .post('/equipments')
      .send({ name: 'Casco', manufacturingPlantId: 1 })
      .expect(201);
    expect(service.create).toHaveBeenCalledWith({
      name: 'Casco',
      manufacturingPlantId: 1,
    });

    await http.http().patch('/equipments/5').send({ price: 10 }).expect(200);
    expect(service.update).toHaveBeenCalledWith(5, { price: 10 });
  });

  it('POST valida el cuerpo', async () => {
    await http
      .http()
      .post('/equipments')
      .send({ name: 'Casco', price: -1, manufacturingPlantId: 1 })
      .expect(400);

    expect(service.create).not.toHaveBeenCalled();
  });
});
