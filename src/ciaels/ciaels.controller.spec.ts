import { Logger } from '@nestjs/common';
import XlsxPopulate from 'xlsx-populate';

import {
  binaryParser,
  buildUser,
  createHttpTestApp,
  HttpTestApp,
  mockProvider,
} from '@test/utils';
import { CiaelsController } from './ciaels.controller';
import { CiaelsService } from './ciaels.service';

const named = (name: string) => ({ name });

/** Registro como lo devuelve findAll (solo los campos del select). */
const buildRecord = (overrides: object = {}) => ({
  description: 'Golpe en mano',
  eventDate: '2026-03-15',
  daysOfDisability: 2,
  timeWorked: 4,
  usualWork: true,
  isDeath: false,
  isInside: true,
  monthsOfSeniority: 24,
  typeOfEvent: named('Accidente'),
  employee: {
    code: 123,
    name: 'Ana Pérez',
    gender: named('Femenino'),
    birthdate: '1990-01-01',
    dateOfAdmission: '2024-01-01',
  },
  cieDiagnosis: named('Contusión'),
  zone: { name: 'Almacén', area: named('Logística') },
  accidentPosition: named('Operador'),
  bodyPart: named('Mano'),
  atAgent: named('Herramienta'),
  typeOfInjury: named('Golpe'),
  atMechanism: named('Caída de objeto'),
  workingDay: named('Normal'),
  typeOfLink: named('Directo'),
  machine: named('Prensa'),
  associatedTask: named('Carga'),
  areaLeader: named('Líder'),
  riskFactor: named('Mecánico'),
  natureOfEvent: named('Lesión'),
  manager: named('Gerente'),
  ...overrides,
});

describe('CiaelsController (HTTP)', () => {
  // Las descargas generan el Excel desde la plantilla real (lento).
  jest.setTimeout(30_000);

  let http: HttpTestApp;
  let service: jest.Mocked<CiaelsService>;

  beforeAll(async () => {
    http = await createHttpTestApp({
      controllers: [CiaelsController],
      providers: [mockProvider(CiaelsService)],
      user: buildUser(),
    });
    service = http.get(CiaelsService);
  });

  afterAll(() => http.close());

  beforeEach(() => jest.clearAllMocks());

  describe('GET /ciaels', () => {
    it('con page y limit responde paginado', async () => {
      service.findAllPaginated.mockResolvedValue({ data: [], count: 0 });

      await http
        .http()
        .get('/ciaels')
        .query({ page: 1, limit: 10, employee: 'Ana' })
        .expect(200, { data: [], count: 0 });

      expect(service.findAllPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 10, employee: 'Ana' }),
      );
    });

    it('sin paginación devuelve la lista completa', async () => {
      service.findAll.mockResolvedValue([]);

      await http.http().get('/ciaels').query({ page: 1 }).expect(200, []);

      expect(service.findAll).toHaveBeenCalled();
      expect(service.findAllPaginated).not.toHaveBeenCalled();
    });

    it.each([
      ['fecha con otro formato', { startDate: '15/03/2026' }],
      ['página 0', { page: 0 }],
    ])('responde 400 con %s', async (_c, query) => {
      await http.http().get('/ciaels').query(query).expect(400);
    });
  });

  describe('POST /ciaels', () => {
    it('convierte la fecha del evento y llama al servicio', async () => {
      service.create.mockResolvedValue({ id: 1 } as never);

      await http
        .http()
        .post('/ciaels')
        .send({
          manufacturingPlantId: 1,
          typeOfEventId: 2,
          description: 'x',
          employeeId: 3,
          eventDate: '2026-03-15',
          cieDiagnosisId: 4,
          accidentPositionId: 5,
          zoneId: 6,
          bodyPartId: 7,
          atAgentId: 8,
          typeOfInjuryId: 9,
          atMechanismId: 10,
          workingDayId: 11,
          usualWork: true,
          typeOfLinkId: 12,
          isDeath: false,
          machineId: 13,
          isInside: true,
          associatedTaskId: 14,
          areaLeaderId: 15,
          riskFactorId: 16,
          natureOfEventsId: 17,
        })
        .expect(201);

      expect(service.create.mock.calls[0][0].eventDate).toBeInstanceOf(Date);
    });

    it('sin campos obligatorios responde 400', async () => {
      await http.http().post('/ciaels').send({ description: 'x' }).expect(400);

      expect(service.create).not.toHaveBeenCalled();
    });
  });

  describe('GET /ciaels/download/excel', () => {
    it('llena el formato con un renglón por registro', async () => {
      service.findAll.mockResolvedValue([
        buildRecord(),
        buildRecord({
          employee: { code: 5, name: 'Sin datos', birthdate: null },
          zone: { name: 'Patio' },
          manager: null,
          usualWork: false,
          isDeath: true,
          isInside: false,
        }),
      ] as never);

      const res = await http
        .http()
        .get('/ciaels/download/excel')
        .buffer(true)
        .parse(binaryParser)
        .expect(200);

      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="archivo_actualizado_ciael.xlsx"',
      );
      const sheet = (await XlsxPopulate.fromDataAsync(res.body)).sheet(
        'Registro',
      );
      expect(sheet.cell('A9').value()).toBe('Accidente');
      expect(sheet.cell('D9').value()).toBe('Ana Pérez');
      expect(sheet.cell('E9').value()).toBe('Femenino');
      expect(sheet.cell('F9').value()).toBe('1990-01-01');
      expect(typeof sheet.cell('G9').value()).toBe('number');
      expect(sheet.cell('I9').value()).toBe(2026);
      expect(sheet.cell('J9').value()).toBe('MARZO');
      expect(sheet.cell('M9').value()).toBe('Logística');
      expect(sheet.cell('V9').value()).toBe('SI');
      expect(sheet.cell('AG9').value()).toBe('Gerente');
      // Segundo registro: datos faltantes con valores por defecto.
      expect(sheet.cell('E10').value()).toBeUndefined();
      expect(sheet.cell('F10').value()).toBeUndefined();
      expect(sheet.cell('M10').value()).toBe('Sin zona asignada');
      expect(sheet.cell('V10').value()).toBe('NO');
      expect(sheet.cell('X10').value()).toBe('SI');
      expect(sheet.cell('Z10').value()).toBe('NO');
      expect(sheet.cell('AG10').value()).toBeUndefined();
    });

    it('si el formato no se puede llenar responde 500 y lo registra', async () => {
      service.findAll.mockResolvedValue([{ employee: {} }] as never);
      const logError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await http
        .http()
        .get('/ciaels/download/excel')
        .expect(500, 'Error al procesar el archivo');

      expect(logError).toHaveBeenCalled();
      logError.mockRestore();
    });
  });

  describe('por id', () => {
    it('GET /ciaels/:id', async () => {
      service.findOne.mockResolvedValue({ id: 5 } as never);

      await http.http().get('/ciaels/5').expect(200, { id: 5 });

      expect(service.findOne).toHaveBeenCalledWith(5);
    });
  });
});
