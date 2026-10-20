import { NotFoundException } from '@nestjs/common';

import {
  buildUser,
  createHttpTestApp,
  HttpTestApp,
  mockProvider,
} from '@test/utils';
import { EvidencesController } from './evidences.controller';
import { EvidencesService } from './evidences.service';

describe('EvidencesController (HTTP)', () => {
  let http: HttpTestApp;
  let service: jest.Mocked<EvidencesService>;

  beforeAll(async () => {
    http = await createHttpTestApp({
      controllers: [EvidencesController],
      providers: [mockProvider(EvidencesService)],
      user: buildUser({ id: 7 }),
    });
    service = http.get(EvidencesService);
  });

  afterAll(() => http.close());

  beforeEach(() => jest.clearAllMocks());

  describe('POST /evidences (crear)', () => {
    const valid = {
      manufacturingPlantId: '1',
      type: '2',
      typeHallazgo: '3',
      zone: '4',
      process: '5',
    };

    it('convierte los campos del formulario a número y llama al servicio', async () => {
      service.create.mockResolvedValue({ id: 9 } as never);

      await http
        .http()
        .post('/evidences')
        .field({ ...valid, priorityDays: '3', description: 'Derrame' })
        .expect(201, { id: 9 });

      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          manufacturingPlantId: 1,
          type: 2,
          priorityDays: 3,
          description: 'Derrame',
        }),
        undefined,
      );
    });

    it.each([
      ['sin planta', { ...valid, manufacturingPlantId: undefined }],
      ['con un campo no permitido', { ...valid, extra: 'x' }],
      ['con prioridad negativa', { ...valid, priorityDays: '-1' }],
    ])('responde 400 %s', async (_c, body) => {
      const fields = Object.fromEntries(
        Object.entries(body).filter(([, value]) => value !== undefined),
      ) as Record<string, string>;

      await http.http().post('/evidences').field(fields).expect(400);

      expect(service.create).not.toHaveBeenCalled();
    });

    it('rechaza un archivo que no es imagen (400) sin guardarlo', async () => {
      await http
        .http()
        .post('/evidences')
        .field(valid)
        .attach('file', Buffer.from('hola'), 'nota.txt')
        .expect(400);

      expect(service.create).not.toHaveBeenCalled();
    });
  });

  it('POST /evidences/solution/:id pasa id, archivo y descripción', async () => {
    await http
      .http()
      .post('/evidences/solution/12')
      .field({ descriptionSolution: 'Listo' })
      .expect(201);

    expect(service.saveSolution).toHaveBeenCalledWith(12, undefined, 'Listo');
  });

  it('POST /evidences/process/:id pasa el id numérico', async () => {
    await http.http().post('/evidences/process/12').expect(201);

    expect(service.saveProcessStart).toHaveBeenCalledWith(12, undefined);
  });

  describe('POST /evidences/add/comment/:id', () => {
    it('comenta con el texto recibido', async () => {
      await http
        .http()
        .post('/evidences/add/comment/12')
        .send({ comment: 'Revisado' })
        .expect(201);

      expect(service.addComment).toHaveBeenCalledWith(12, {
        comment: 'Revisado',
      });
    });

    it('un comentario vacío responde 400', async () => {
      await http
        .http()
        .post('/evidences/add/comment/12')
        .send({ comment: '' })
        .expect(400);

      expect(service.addComment).not.toHaveBeenCalled();
    });
  });

  it('GET /evidences/permissions/config devuelve las listas de permisos', async () => {
    service.getPermissionsConfig.mockReturnValue({
      supervisorOverrideEmails: ['a@x.test'],
      cancelEvidenceEmails: [],
    });

    await http
      .http()
      .get('/evidences/permissions/config')
      .expect(200, {
        supervisorOverrideEmails: ['a@x.test'],
        cancelEvidenceEmails: [],
      });
  });

  describe('GET /evidences/:id', () => {
    it('devuelve el hallazgo', async () => {
      service.findOne.mockResolvedValue({ id: 12 } as never);

      await http.http().get('/evidences/12').expect(200, { id: 12 });

      expect(service.findOne).toHaveBeenCalledWith(12);
    });

    it('propaga el 404 del servicio (otra planta o inexistente)', async () => {
      service.findOne.mockRejectedValue(
        new NotFoundException('No se ha encontrado el hallazgo #12'),
      );

      await http.http().get('/evidences/12').expect(404);
    });
  });

  describe('GET /evidences/download/:type', () => {
    it('pasa el tipo y los filtros (validados) al servicio', async () => {
      service.downloadFile.mockImplementation(async (_type, _query, res) => {
        res.send('ok');
      });

      await http
        .http()
        .get('/evidences/download/xlsx')
        .query({ manufacturingPlantId: '1', statuses: 'Abierto' })
        .expect(200);

      expect(service.downloadFile).toHaveBeenCalledWith(
        'xlsx',
        expect.objectContaining({
          manufacturingPlantId: 1,
          statuses: 'Abierto',
        }),
        expect.anything(),
      );
    });

    it.each([
      ['ids con texto', { ids: '1,abc' }],
      ['fecha con otro formato', { startDate: '2026-10-01' }],
      ['un filtro desconocido', { foo: 'bar' }],
    ])('responde 400 con %s', async (_c, query) => {
      await http
        .http()
        .get('/evidences/download/xlsx')
        .query(query)
        .expect(400);

      expect(service.downloadFile).not.toHaveBeenCalled();
    });
  });

  it('PATCH /evidences/reassign/:id valida la lista de responsables', async () => {
    await http
      .http()
      .patch('/evidences/reassign/12')
      .send({ responsibleIds: [3, 4] })
      .expect(200);
    expect(service.reassignResponsibles).toHaveBeenCalledWith(12, {
      responsibleIds: [3, 4],
    });

    await http
      .http()
      .patch('/evidences/reassign/12')
      .send({ responsibleIds: [3, 3] })
      .expect(400);
    expect(service.reassignResponsibles).toHaveBeenCalledTimes(1);
  });

  it('PATCH /evidences/:id llega al servicio con el id numérico', async () => {
    await http.http().patch('/evidences/12').send({}).expect(200);

    expect(service.update).toHaveBeenCalledWith(12, {});
  });

  it('DELETE /evidences/:id cancela', async () => {
    await http.http().delete('/evidences/12').expect(200);

    expect(service.remove).toHaveBeenCalledWith(12);
  });
});
