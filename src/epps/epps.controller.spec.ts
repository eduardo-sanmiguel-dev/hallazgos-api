import { Logger, NotFoundException } from '@nestjs/common';
import XlsxPopulate from 'xlsx-populate';

import {
  binaryParser,
  buildManufacturingPlant,
  buildUser,
  createHttpTestApp,
  HttpTestApp,
  mockProvider,
} from '@test/utils';
import { EppsController } from './epps.controller';
import { EppsService } from './epps.service';

// PNG de 1x1: la firma se guarda como data URL.
const SIGNATURE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('EppsController (HTTP)', () => {
  // Las descargas generan el Excel desde la plantilla real (lento).
  jest.setTimeout(30_000);

  let http: HttpTestApp;
  let service: jest.Mocked<EppsService>;

  beforeAll(async () => {
    http = await createHttpTestApp({
      controllers: [EppsController],
      providers: [mockProvider(EppsService)],
      user: buildUser({
        manufacturingPlants: [buildManufacturingPlant({ id: 1 })],
      }),
    });
    service = http.get(EppsService);
  });

  afterAll(() => http.close());

  beforeEach(() => jest.clearAllMocks());

  describe('POST /epps', () => {
    const valid = {
      employeeId: 7,
      signature: SIGNATURE,
      equipments: [{ id: 3, quantity: 1, observations: '' }],
    };

    it('registra la entrega', async () => {
      service.create.mockResolvedValue({ message: 'EPP created successfully' });

      await http.http().post('/epps').send(valid).expect(201);

      expect(service.create).toHaveBeenCalledWith(valid);
    });

    it.each([
      ['sin empleado', { ...valid, employeeId: undefined }],
      [
        'con cantidad 0',
        { ...valid, equipments: [{ id: 3, quantity: 0, observations: '' }] },
      ],
      [
        'con un equipo sin id',
        { ...valid, equipments: [{ quantity: 1, observations: '' }] },
      ],
    ])('responde 400 %s', async (_c, body) => {
      await http.http().post('/epps').send(body).expect(400);

      expect(service.create).not.toHaveBeenCalled();
    });
  });

  describe('GET /epps', () => {
    it('con page responde paginado de la planta propia', async () => {
      service.findPaginated.mockResolvedValue({ data: [], count: 0 } as never);

      await http
        .http()
        .get('/epps')
        .query({ manufacturingPlantId: 1, page: 1, orderBy: 'area' })
        .expect(200);

      expect(service.findPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ manufacturingPlantId: 1, orderBy: 'area' }),
      );
    });

    it.each([
      ['una columna de orden no permitida', { orderBy: 'password' }],
      ['una fecha con otro formato', { startDate: '01/10/2026' }],
    ])('responde 400 con %s', async (_c, query) => {
      await http
        .http()
        .get('/epps')
        .query({ manufacturingPlantId: 1, page: 1, ...query })
        .expect(400);

      expect(service.findPaginated).not.toHaveBeenCalled();
    });
  });

  describe('GET /epps/validate-delivery-frequency', () => {
    it('valida que el empleado sea de la planta antes de consultar', async () => {
      service.validateDeliveryFrequency.mockResolvedValue({
        canDeliver: true,
        message: 'El equipo puede ser entregado.',
      });

      await http
        .http()
        .get('/epps/validate-delivery-frequency')
        .query({ equipmentId: 3, employeeId: 7 })
        .expect(200, {
          canDeliver: true,
          message: 'El equipo puede ser entregado.',
        });

      expect(service.assertEmployeeInUserPlants).toHaveBeenCalledWith(7);
      expect(service.validateDeliveryFrequency).toHaveBeenCalledWith(3, 7);
    });

    it('un empleado de otra planta responde 404', async () => {
      service.assertEmployeeInUserPlants.mockRejectedValueOnce(
        new NotFoundException('Empleado #7 no encontrado'),
      );

      await http
        .http()
        .get('/epps/validate-delivery-frequency')
        .query({ equipmentId: 3, employeeId: 7 })
        .expect(404);

      expect(service.validateDeliveryFrequency).not.toHaveBeenCalled();
    });

    it('sin ids numéricos responde 400 (antes llegaba NaN a la base)', async () => {
      await http
        .http()
        .get('/epps/validate-delivery-frequency')
        .query({ equipmentId: 'x' })
        .expect(400);
    });
  });

  describe('GET /epps/download/file/:employeeId (Excel)', () => {
    const history = (signature = SIGNATURE) => [
      {
        signature,
        employee: {
          name: 'Ana Pérez',
          code: 123,
          position: { name: 'Operador' },
          area: { name: 'Producción' },
        },
        equipments: [
          {
            equipment: { name: 'Casco' },
            deliveryDate: new Date('2026-10-01T00:00:00Z'),
            observations: 'talla M',
          },
          {
            equipment: { name: 'Guantes' },
            deliveryDate: new Date('2026-10-02T00:00:00Z'),
            observations: '',
          },
        ],
      },
    ];

    beforeEach(() => {
      service.getDownloadFileName.mockResolvedValue('EPP_prueba.xlsx');
    });

    it('genera el formato con los datos del empleado y cada entrega', async () => {
      service.findEppsByEmployeeId.mockResolvedValue(history() as never);

      const res = await http
        .http()
        .get('/epps/download/file/7')
        .query({ timeZone: 'America/Bogota' })
        .buffer(true)
        .parse(binaryParser)
        .expect(200);

      expect(service.assertEmployeeInUserPlants).toHaveBeenCalledWith(7);
      expect(service.getDownloadFileName).toHaveBeenCalledWith(
        7,
        'America/Bogota',
      );
      expect(res.headers['content-disposition']).toContain(
        'filename="EPP_prueba.xlsx"',
      );
      const sheet = (await XlsxPopulate.fromDataAsync(res.body)).sheet(0);
      expect(sheet.cell('B4').value()).toBe('NOMBRE DEL EMPLEADO: Ana Pérez');
      expect(sheet.cell('E4').value()).toBe('CÉDULA: 123');
      expect(sheet.cell('B5').value()).toBe('CARGO: Operador');
      expect(sheet.cell('E5').value()).toBe('ÁREA: Producción');
      expect(sheet.cell('B9').value()).toBe('Casco');
      expect(sheet.cell('C9').value()).toBe('2026-10-01');
      expect(sheet.cell('E9').value()).toBe('talla M');
      expect(sheet.cell('B10').value()).toBe('Guantes');
      expect(String(sheet.cell('B34').value())).toContain('Ana Pérez');
    });

    it('un empleado sin EPP registrados responde 404 (antes 500)', async () => {
      service.findEppsByEmployeeId.mockResolvedValue([]);

      await http.http().get('/epps/download/file/7').expect(404, {
        statusCode: 404,
        message: 'El empleado #7 no tiene EPP registrados',
        error: 'Not Found',
      });
    });

    it('un empleado de otra planta responde 404 sin armar el archivo', async () => {
      service.assertEmployeeInUserPlants.mockRejectedValueOnce(
        new NotFoundException('Empleado #8 no encontrado'),
      );

      await http.http().get('/epps/download/file/8').expect(404);

      expect(service.findEppsByEmployeeId).not.toHaveBeenCalled();
    });

    it('una firma dañada responde 500 con mensaje y queda en el log', async () => {
      service.findEppsByEmployeeId.mockResolvedValue(
        history('sin-formato') as never,
      );
      const logError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await http
        .http()
        .get('/epps/download/file/7')
        .expect(500, 'Error al procesar el archivo');

      expect(logError).toHaveBeenCalledWith(
        'Error al procesar el archivo',
        expect.anything(),
      );
      logError.mockRestore();
    });
  });

  it('GET /epps/:id devuelve la entrega', async () => {
    service.findOne.mockResolvedValue({ id: 50 } as never);

    await http.http().get('/epps/50').expect(200, { id: 50 });

    expect(service.findOne).toHaveBeenCalledWith(50);
  });

  it('DELETE /epps/history/:id borra el registro del historial', async () => {
    service.removeHistory.mockResolvedValue({ message: 'ok' });

    await http.http().delete('/epps/history/9').expect(200, { message: 'ok' });

    expect(service.removeHistory).toHaveBeenCalledWith(9);
  });
});

describe('EppsController: integridad de la entrega', () => {
  it.each([
    {
      employeeId: 7,
      signature: '',
      equipments: [{ id: 3, quantity: 1, observations: '' }],
    },
    {
      employeeId: 7,
      signature: SIGNATURE,
      equipments: [{ id: 3, quantity: 0.5, observations: '' }],
    },
    {
      employeeId: 7,
      signature: SIGNATURE,
      equipments: [
        { id: 3, quantity: 1, observations: '' },
        { id: 3, quantity: 1, observations: '' },
      ],
    },
  ])(
    'rechaza firmas vacías, cantidades fraccionarias y equipos duplicados',
    async (body) => {
      const http = await createHttpTestApp({
        controllers: [EppsController],
        providers: [mockProvider(EppsService)],
        user: buildUser(),
      });
      try {
        await http.http().post('/epps').send(body).expect(400);
        expect(http.get(EppsService).create).not.toHaveBeenCalled();
      } finally {
        await http.close();
      }
    },
  );
});
