import { Ics } from '../../src/ics/entities/ics.entity.js';
import { EmergencyTeam } from '../../src/emergency-teams/entities/emergency-team.entity.js';
import { Logger } from '@nestjs/common';
import { ExtinguisherInspection } from '../../src/extinguisher-inspections/entities/extinguisher-inspection.entity.js';
import { ExtinguisherInspectionEvaluation } from '../../src/extinguisher-inspections/entities/extinguisher-inspection-evaluation.entity.js';
import { User } from '../../src/users/entities/user.entity.js';
import { JwtService } from '../../src/auth/jwt.service.js';
import request from 'supertest';
import { mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { createE2eApp, type E2eApp } from './e2e-app.js';
import { saveEvidence } from './fixtures.js';

describe('Regresión de flujos de prioridad media', () => {
  let e2e: E2eApp;
  const images: string[] = [];
  beforeAll(async () => {
    e2e = await createE2eApp();
  });
  afterAll(async () => {
    for (const p of images) unlinkSync(p);
    await e2e?.close();
  });
  const evaluation = (overrides: object = {}) => ({
    location: 'Almacén',
    extinguisherNumber: 'MED-1',
    typeOfExtinguisher: 'PQS',
    capacity: 6,
    pressureManometer: 'C',
    valve: 'C',
    hose: 'C',
    cylinder: 'C',
    barrette: 'C',
    seal: 'C',
    cornet: 'C',
    access: 'C',
    support: 'C',
    nextRechargeDate: '2099-12-01',
    maintenanceDate: '2099-11-01',
    observations: 'Correcto',
    ...overrides,
  });
  it.each(['zones', 'evaluations', 'observers', 'calendar'])(
    'solo Administradores configuran Gemba: %s',
    async (resource) => {
      for (const token of [e2e.tokens.general, e2e.tokens.supervisor]) {
        await e2e
          .call('post', '/gemba-walk/' + resource, token)
          .send({})
          .expect(403);
        await e2e
          .call(
            'patch',
            '/gemba-walk/' + resource + (resource === 'calendar' ? '' : '/1'),
            token,
          )
          .send({})
          .expect(403);
        await e2e
          .call('delete', '/gemba-walk/' + resource + '/1', token)
          .expect(403);
      }
    },
  );
  it('las zonas y conceptos ajenos no se listan ni se consultan por id', async () => {
    const zone = await e2e
      .call('post', '/gemba-walk/zones', e2e.tokens.admin)
      .send({
        manufacturingPlantId: 2,
        nameZone: 'Otra planta',
        nameLocation: 'Bodega',
      })
      .expect(201);
    const concept = await e2e
      .call('post', '/gemba-walk/evaluations', e2e.tokens.admin)
      .send({
        manufacturingPlantId: 2,
        area: 'Orden',
        category: 'SHE',
        description: 'Otra planta',
      })
      .expect(201);
    for (const [resource, id] of [
      ['zones', zone.body.id],
      ['evaluations', concept.body.id],
    ]) {
      await e2e
        .call(
          'get',
          '/gemba-walk/' + resource + '/' + id,
          e2e.tokens.supervisor,
        )
        .expect(404);
      const list = await e2e
        .call(
          'get',
          '/gemba-walk/' + resource + '?manufacturingPlantId=2',
          e2e.tokens.supervisor,
        )
        .expect(200);
      expect(list.body).toEqual([]);
    }
  });
  it('las inspecciones no permiten crear, leer, editar, borrar ni descargar otra planta', async () => {
    const body = { manufacturingPlantId: 2, evaluations: [evaluation()] };
    await e2e
      .call('post', '/extinguisher-inspections', e2e.tokens.supervisor)
      .send(body)
      .expect(404);
    const created = await e2e
      .call('post', '/extinguisher-inspections', e2e.tokens.generalColombia)
      .send(body)
      .expect(201);
    const url = '/extinguisher-inspections/' + created.body.id;
    await e2e.call('get', url, e2e.tokens.supervisor).expect(404);
    await e2e
      .call('patch', url, e2e.tokens.supervisor)
      .send({ evaluations: [evaluation()] })
      .expect(404);
    await e2e.call('delete', url, e2e.tokens.supervisor).expect(404);
    await e2e
      .call(
        'get',
        '/extinguisher-inspections/download/file/' + created.body.id,
        e2e.tokens.supervisor,
      )
      .expect(404);
    const list = await e2e
      .call('get', '/extinguisher-inspections', e2e.tokens.supervisor)
      .expect(200);
    expect(list.body).toEqual([]);
  });
  it('editar valida fechas y reemplaza evaluaciones dentro de una transacción', async () => {
    const created = await e2e
      .call('post', '/extinguisher-inspections', e2e.tokens.supervisor)
      .send({ manufacturingPlantId: 1, evaluations: [evaluation()] })
      .expect(201);
    const url = '/extinguisher-inspections/' + created.body.id;
    for (const maintenanceDate of [
      '2020-01-01',
      '2099-02-29',
      '2099-01-01T00:00:00Z',
    ])
      await e2e
        .call('patch', url, e2e.tokens.supervisor)
        .send({ evaluations: [evaluation({ maintenanceDate })] })
        .expect(400);
    await e2e
      .call('patch', url, e2e.tokens.supervisor)
      .send({ manufacturingPlantId: 2 })
      .expect(404);
    const updated = await e2e
      .call('patch', url, e2e.tokens.supervisor)
      .send({ evaluations: [evaluation({ location: 'Nueva ubicación' })] })
      .expect(200);
    expect(updated.body.evaluations).toHaveLength(1);
    expect(updated.body.evaluations[0].location).toBe('Nueva ubicación');
    await e2e.call('delete', url, e2e.tokens.supervisor).expect(200);
    await e2e.call('get', url, e2e.tokens.supervisor).expect(404);
  });
  it('las imágenes exigen sesión y planta incluso en su URL estática', async () => {
    const filename = randomUUID() + '-evidence.png';
    const folder = join(process.cwd(), 'public/static/images/evidences');
    mkdirSync(folder, { recursive: true });
    const full = join(folder, filename);
    writeFileSync(full, Buffer.from('89504e470d0a1a0a', 'hex'));
    images.push(full);
    await saveEvidence(e2e.dataSource, e2e.base, { imgEvidence: filename });
    const url = '/static/images/evidences/' + filename;
    await request(e2e.server).get(url).expect(401);
    await request(e2e.server)
      .get(url)
      .set('Authorization', 'Bearer invalid')
      .expect(401);
    await request(e2e.server)
      .get(url)
      .set('Authorization', 'Bearer ' + e2e.tokens.generalColombia)
      .expect(404);
    const allowed = await request(e2e.server)
      .get(url)
      .set('Cookie', 'token=' + e2e.tokens.general)
      .expect(200);
    expect(allowed.headers['cache-control']).toContain('private');
    expect(allowed.headers['cache-control']).toContain('no-store');
    await request(e2e.server)
      .get('/static/images/evidences/' + randomUUID() + '.png')
      .set('Authorization', 'Bearer ' + e2e.tokens.general)
      .expect(404);
  });
  it.each(['31/02/2026', '20/10/2026/extra', '2026-10-20'])(
    'los reportes rechazan fechas inválidas: %s',
    async (startDate) => {
      await e2e
        .call(
          'get',
          '/dashboard/status-by-filters?manufacturingPlantId=1&startDate=' +
            encodeURIComponent(startDate),
          e2e.tokens.admin,
        )
        .expect(400);
      await e2e
        .call(
          'get',
          '/evidences/download/excel?startDate=' +
            encodeURIComponent(startDate),
          e2e.tokens.admin,
        )
        .expect(400);
    },
  );
  it('un administrador también queda limitado a sus plantas en toda la configuración', async () => {
    const { dataSource, base } = e2e;
    const restricted = await dataSource.getRepository(User).save({
      name: 'Admin de una planta',
      email: 'restricted@hallazgos.test',
      password: base.users.admin.password,
      role: base.users.admin.role,
      manufacturingPlants: [base.plants.tepotzotlan],
    });
    const token = e2e.app.get(JwtService).create(restricted.id);
    const zone = await e2e
      .call('post', '/gemba-walk/zones', e2e.tokens.admin)
      .send({
        manufacturingPlantId: 2,
        nameZone: 'Restringida',
        nameLocation: 'L2',
      })
      .expect(201);
    const concept = await e2e
      .call('post', '/gemba-walk/evaluations', e2e.tokens.admin)
      .send({
        manufacturingPlantId: 2,
        area: 'Restringida',
        category: 'SHE',
        description: 'Seguridad',
      })
      .expect(201);
    const observer = await e2e
      .call('post', '/gemba-walk/observers', e2e.tokens.admin)
      .send({
        manufacturingPlantId: 2,
        gembaWalkZoneId: zone.body.id,
        userIds: [base.users.generalColombia.id],
      })
      .expect(201);
    const event = await e2e
      .call('post', '/gemba-walk/calendar', e2e.tokens.admin)
      .send({
        events: [
          {
            gembaWalkZoneId: zone.body.id,
            scheduledAt: new Date(Date.now() + 86400000).toISOString(),
          },
        ],
      })
      .expect(201);
    for (const [resource, id, body] of [
      ['zones', zone.body.id, { nameZone: 'Invasión' }],
      ['evaluations', concept.body.id, { description: 'Invasión' }],
      [
        'observers',
        observer.body[0].id,
        { userId: base.users.generalColombia.id },
      ],
      [
        'calendar',
        event.body[0].id,
        { events: [{ id: event.body[0].id, isAdditional: true }] },
      ],
    ] as const) {
      await e2e
        .call('get', '/gemba-walk/' + resource + '/' + id, token)
        .expect(404);
      await e2e
        .call('delete', '/gemba-walk/' + resource + '/' + id, token)
        .expect(404);
      await e2e
        .call(
          'patch',
          '/gemba-walk/' + resource + (resource === 'calendar' ? '' : '/' + id),
          token,
        )
        .send(body)
        .expect(resource === 'calendar' ? 400 : 404);
      const list = await e2e
        .call('get', '/gemba-walk/' + resource, token)
        .expect(200);
      expect(list.body).toEqual([]);
    }
    await e2e
      .call('post', '/gemba-walk/zones', token)
      .send({
        manufacturingPlantId: 2,
        nameZone: 'Prohibida',
        nameLocation: 'L3',
      })
      .expect(404);
    await e2e
      .call('post', '/gemba-walk/evaluations', token)
      .send({
        manufacturingPlantId: 2,
        area: 'Prohibida',
        category: 'SHE',
        description: 'No crear',
      })
      .expect(404);
    await e2e
      .call('post', '/gemba-walk/observers', token)
      .send({
        manufacturingPlantId: 2,
        gembaWalkZoneId: zone.body.id,
        userIds: [base.users.generalColombia.id],
      })
      .expect(404);
    await e2e
      .call('post', '/gemba-walk/calendar', token)
      .send({
        events: [
          {
            gembaWalkZoneId: zone.body.id,
            scheduledAt: new Date(Date.now() + 172800000).toISOString(),
          },
        ],
      })
      .expect(400);
  });
  it('un fallo al guardar evaluaciones revierte la creación y la edición completas', async () => {
    const created = await e2e
      .call('post', '/extinguisher-inspections', e2e.tokens.supervisor)
      .send({ manufacturingPlantId: 1, evaluations: [evaluation()] })
      .expect(201);
    const headers = e2e.dataSource.getRepository(ExtinguisherInspection);
    const rows = e2e.dataSource.getRepository(ExtinguisherInspectionEvaluation);
    const headerCount = await headers.count();
    const evalCount = await rows.count();
    await e2e.dataSource.query(
      "CREATE FUNCTION medium_fail_evaluation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo simulado'; END $$",
    );
    await e2e.dataSource.query(
      'CREATE TRIGGER medium_fail_evaluation BEFORE INSERT ON extinguisher_inspection_evaluations FOR EACH ROW EXECUTE FUNCTION medium_fail_evaluation()',
    );
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    try {
      await e2e
        .call('post', '/extinguisher-inspections', e2e.tokens.supervisor)
        .send({ manufacturingPlantId: 1, evaluations: [evaluation()] })
        .expect(500);
      expect(await headers.count()).toBe(headerCount);
      expect(await rows.count()).toBe(evalCount);
      await e2e
        .call(
          'patch',
          '/extinguisher-inspections/' + created.body.id,
          e2e.tokens.supervisor,
        )
        .send({ evaluations: [evaluation({ location: 'No guardar' })] })
        .expect(500);
      const original = await e2e
        .call(
          'get',
          '/extinguisher-inspections/' + created.body.id,
          e2e.tokens.supervisor,
        )
        .expect(200);
      expect(original.body.evaluations).toHaveLength(1);
      expect(original.body.evaluations[0].location).toBe('Almacén');
      expect(await rows.count()).toBe(evalCount);
    } finally {
      log.mockRestore();
      await e2e.dataSource.query(
        'DROP TRIGGER medium_fail_evaluation ON extinguisher_inspection_evaluations',
      );
      await e2e.dataSource.query('DROP FUNCTION medium_fail_evaluation()');
    }
  });
  it('los reportes rechazan fechas repetidas sin generar un error interno', async () => {
    await e2e
      .call(
        'get',
        '/dashboard/status-by-filters?manufacturingPlantId=1&startDate=20%2F10%2F2026&startDate=21%2F10%2F2026',
        e2e.tokens.admin,
      )
      .expect(400);
  });
  it('ICS y equipos de emergencia no exponen ni modifican registros de otras plantas', async () => {
    const ics = await e2e.dataSource
      .getRepository(Ics)
      .save({
        totalPeople: 1,
        totalCorrectPeople: 1,
        totalIncorrectPeople: 0,
        icsPercentage: 100,
        manufacturingPlant: e2e.base.plants.manizales,
        createdBy: e2e.base.users.generalColombia,
      });
    const team = await e2e
      .call('post', '/emergency-teams', e2e.tokens.generalColombia)
      .send({
        manufacturingPlantId: 2,
        location: 'Almacén central',
        extinguisherNumber: 'MED-2',
        typeOfExtinguisher: 'PQS',
        capacity: 6,
      })
      .expect(201);
    for (const [resource, id, body] of [
      ['ics', ics.id, { description: 'No editar' }],
      ['emergency-teams', team.body.id, { location: 'No editar' }],
    ] as const) {
      await e2e
        .call('get', '/' + resource + '/' + id, e2e.tokens.general)
        .expect(404);
      await e2e
        .call('patch', '/' + resource + '/' + id, e2e.tokens.general)
        .send(body)
        .expect(404);
      await e2e
        .call('delete', '/' + resource + '/' + id, e2e.tokens.general)
        .expect(404);
      const list = await e2e
        .call(
          'get',
          '/' + resource + '?manufacturingPlantId=2',
          e2e.tokens.general,
        )
        .expect(200);
      expect(list.body.data ?? list.body).toEqual([]);
      await e2e
        .call('get', '/' + resource + '/' + id, e2e.tokens.generalColombia)
        .expect(200);
    }
    await e2e
      .call('post', '/emergency-teams', e2e.tokens.general)
      .send({
        manufacturingPlantId: 2,
        location: 'Almacén central',
        extinguisherNumber: 'MED-3',
        typeOfExtinguisher: 'PQS',
        capacity: 6,
      })
      .expect(404);
    const own = await e2e
      .call('post', '/emergency-teams', e2e.tokens.general)
      .send({
        manufacturingPlantId: 1,
        location: 'Almacén local',
        extinguisherNumber: 'MED-4',
        typeOfExtinguisher: 'PQS',
        capacity: 6,
      })
      .expect(201);
    await e2e
      .call('patch', '/emergency-teams/' + own.body.id, e2e.tokens.general)
      .send({ manufacturingPlantId: 2 })
      .expect(404);
    expect(
      await e2e.dataSource
        .getRepository(EmergencyTeam)
        .existsBy({ id: team.body.id, isActive: true }),
    ).toBe(true);
  });
});
