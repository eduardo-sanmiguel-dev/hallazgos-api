/**
 * E2E (app completa + base de pruebas): flujo de hallazgos.
 */
import { readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

import request from 'supertest';

import { Evidence } from '../../src/evidences/entities/evidence.entity.js';
import { APP_KEY, createE2eApp, type E2eApp } from './e2e-app.js';
import { saveEvidence, STATUSES } from './fixtures.js';

// PNG de 1x1 para las imágenes de proceso y solución.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const IMAGES_DIR = join(
  __dirname,
  '..',
  '..',
  'public',
  'static',
  'images',
  'evidences',
);

describe('E2E: hallazgos', () => {
  let e2e: E2eApp;
  const startedAt = Date.now();

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  /** PNG de prueba subidos en esta corrida que siguen en disco. */
  const testUploads = () =>
    readdirSync(IMAGES_DIR).filter((name) => {
      const { size, mtimeMs } = statSync(join(IMAGES_DIR, name));
      return size === PNG.length && mtimeMs >= startedAt;
    });

  afterAll(async () => {
    // Borra los PNG de las peticiones que terminaron bien.
    for (const name of testUploads()) unlinkSync(join(IMAGES_DIR, name));
    await e2e?.close();
  });

  const fields = () => ({
    manufacturingPlantId: String(e2e.base.plants.tepotzotlan.id),
    type: String(e2e.base.mainType.id),
    typeHallazgo: String(e2e.base.secondaryType.id),
    zone: String(e2e.base.zone.id),
    process: String(e2e.base.process.id),
    description: 'Derrame en pasillo',
    priorityDays: '8',
  });

  describe('crear', () => {
    it('un usuario de la planta lo crea con los supervisores de la zona y del proceso', async () => {
      const res = await e2e
        .call('post', '/evidences', e2e.tokens.general)
        .field(fields())
        .expect(201);

      // El endpoint responde "ok"; el hallazgo se revisa en la base.
      expect(res.text).toBe('ok');
      const [created] = await e2e.dataSource.getRepository(Evidence).find({
        order: { id: 'DESC' },
        take: 1,
        relations: ['supervisors', 'responsibles'],
      });
      expect(created).toMatchObject({
        status: STATUSES.open,
        description: 'Derrame en pasillo',
        priorityDays: 8,
      });
      expect(created.supervisors.map(({ email }) => email)).toEqual([
        'supervisor@hallazgos.test',
      ]);
      expect(created.responsibles.map(({ email }) => email)).toEqual([
        'supervisor@hallazgos.test',
      ]);
    });

    it('en una planta ajena responde 404 sin crear', async () => {
      await e2e
        .call('post', '/evidences', e2e.tokens.generalColombia)
        .field(fields())
        .expect(404);
    });

    it('sin campos obligatorios responde 400 y sin sesión 401', async () => {
      await e2e
        .call('post', '/evidences', e2e.tokens.general)
        .field({ description: 'x' })
        .expect(400);
      await e2e.call('post', '/evidences').field(fields()).expect(401);
    });
  });

  describe('ver', () => {
    it('de la propia planta 200; de otra planta 404', async () => {
      const evidence = await saveEvidence(e2e.dataSource, e2e.base);

      await e2e
        .call('get', `/evidences/${evidence.id}`, e2e.tokens.general)
        .expect(200);
      await e2e
        .call('get', `/evidences/${evidence.id}`, e2e.tokens.generalColombia)
        .expect(404);
      await e2e.call('get', '/evidences/999999', e2e.tokens.admin).expect(404);
    });
  });

  describe('flujo de estados', () => {
    it('iniciar en progreso → cerrar → comentar; cerrar de nuevo responde 409', async () => {
      const { id } = await saveEvidence(e2e.dataSource, e2e.base);

      // Un General asignado no inicia ni cierra (regla del UI).
      await e2e
        .call('post', `/evidences/process/${id}`, e2e.tokens.general)
        .attach('file', PNG, 'proceso.png')
        .expect(403);
      // Sin imagen: 400.
      await e2e
        .call('post', `/evidences/process/${id}`, e2e.tokens.supervisor)
        .expect(400);

      const started = await e2e
        .call('post', `/evidences/process/${id}`, e2e.tokens.supervisor)
        .attach('file', PNG, 'proceso.png')
        .expect(201);
      expect(started.body.status).toBe(STATUSES.inProgress);
      expect(e2e.mail.sendInProgress).toHaveBeenCalled();

      // El administrador no cierra (regla del UI).
      await e2e
        .call('post', `/evidences/solution/${id}`, e2e.tokens.admin)
        .field({ descriptionSolution: 'Listo' })
        .expect(403);

      const closed = await e2e
        .call('post', `/evidences/solution/${id}`, e2e.tokens.supervisor)
        .field({ descriptionSolution: 'Se limpió' })
        .attach('file', PNG, 'solucion.png')
        .expect(201);
      expect(closed.body).toMatchObject({
        status: STATUSES.closed,
        descriptionSolution: 'Se limpió',
      });

      const again = await e2e
        .call('post', `/evidences/solution/${id}`, e2e.tokens.supervisor)
        .field({ descriptionSolution: 'Otra vez' })
        .expect(409);
      expect(again.body.message).toMatch(/porque está en estado "Cerrado"/);

      // Comentar se permite en cualquier estado.
      const commented = await e2e
        .call('post', `/evidences/add/comment/${id}`, e2e.tokens.general)
        .send({ comment: 'Gracias' })
        .expect(201);
      expect(commented.body.comments.map(({ comment }) => comment)).toEqual([
        'Gracias',
      ]);
    });

    it('cancelar: un General 403; el administrador cancela; cancelar de nuevo 409', async () => {
      const { id } = await saveEvidence(e2e.dataSource, e2e.base);

      await e2e
        .call('delete', `/evidences/${id}`, e2e.tokens.general)
        .expect(403);

      const res = await e2e
        .call('delete', `/evidences/${id}`, e2e.tokens.admin)
        .expect(200);
      expect(res.body).toMatchObject({
        status: STATUSES.cancelled,
        isActive: false,
      });

      await e2e
        .call('delete', `/evidences/${id}`, e2e.tokens.admin)
        .expect(409);
    });

    it('reasignar a un usuario de otra planta responde 400', async () => {
      const { id } = await saveEvidence(e2e.dataSource, e2e.base);

      await e2e
        .call('patch', `/evidences/reassign/${id}`, e2e.tokens.supervisor)
        .send({ responsibleIds: [e2e.base.users.generalColombia.id] })
        .expect(400);
      await e2e
        .call('patch', `/evidences/reassign/${id}`, e2e.tokens.supervisor)
        .send({ responsibleIds: [e2e.base.users.admin.id] })
        .expect(200);
    });
  });

  describe('imágenes de peticiones rechazadas', () => {
    it('si la petición falla (403, 404, 409) la imagen subida se borra; si termina bien se conserva', async () => {
      const { id } = await saveEvidence(e2e.dataSource, e2e.base);
      const before = testUploads();

      // 403: un General no inicia "en progreso".
      await e2e
        .call('post', `/evidences/process/${id}`, e2e.tokens.general)
        .attach('file', PNG, 'proceso.png')
        .expect(403);
      // 404: crear en una planta ajena.
      await e2e
        .call('post', '/evidences', e2e.tokens.generalColombia)
        .field(fields())
        .attach('file', PNG, 'hallazgo.png')
        .expect(404);
      expect(testUploads()).toEqual(before);

      // Termina bien: la imagen queda guardada.
      const started = await e2e
        .call('post', `/evidences/process/${id}`, e2e.tokens.supervisor)
        .attach('file', PNG, 'proceso.png')
        .expect(201);
      expect(testUploads()).toEqual(
        expect.arrayContaining([started.body.imgProcess]),
      );
      const afterSuccess = testUploads();

      // 409: iniciar otra vez un hallazgo que ya está en progreso.
      await e2e
        .call('post', `/evidences/process/${id}`, e2e.tokens.supervisor)
        .attach('file', PNG, 'proceso.png')
        .expect(409);
      expect(testUploads()).toEqual(afterSuccess);
    });
  });

  describe('listas y descargas', () => {
    // GraphQL no lleva el prefijo /api/v1.
    const graphql = (token?: string) => {
      const req = request(e2e.server)
        .post('/graphql')
        .set('x-app-key', APP_KEY());
      return token ? req.set('Authorization', `Bearer ${token}`) : req;
    };

    it('la lista de GraphQL solo trae hallazgos de las plantas del usuario', async () => {
      await saveEvidence(e2e.dataSource, e2e.base, {
        manufacturingPlant: e2e.base.plants.manizales,
        zone: e2e.base.zoneColombia,
        process: e2e.base.processColombia,
        user: e2e.base.users.generalColombia,
        supervisors: [],
        responsibles: [],
      });

      const query = {
        query:
          '{ evidences(page: 1, limit: -1) { count data { id manufacturingPlant { name } } } }',
      };
      const general = await graphql(e2e.tokens.general).send(query).expect(200);
      const colombia = await graphql(e2e.tokens.generalColombia)
        .send(query)
        .expect(200);

      const plantsOf = (res) =>
        new Set(
          res.body.data.evidences.data.map(
            ({ manufacturingPlant }) => manufacturingPlant.name,
          ),
        );
      expect([...plantsOf(general)]).toEqual(['Tepotzotlán']);
      expect([...plantsOf(colombia)]).toEqual(['Manizales']);
    });

    it('GraphQL sin sesión responde error', async () => {
      const res = await graphql().send({
        query: '{ evidences(page: 1, limit: 10) { count } }',
      });

      expect(JSON.stringify(res.body)).toMatch(/Token no encontrado/);
    });

    it('descarga Excel 200 y un tipo desconocido 400', async () => {
      const res = await e2e
        .call(
          'get',
          '/evidences/download/xlsx?timeZone=America/Mexico_City',
          e2e.tokens.general,
        )
        .expect(200);

      expect(res.headers['content-type']).toContain('spreadsheetml');
      await e2e
        .call('get', '/evidences/download/csv', e2e.tokens.general)
        .expect(400);
    });
  });
});
