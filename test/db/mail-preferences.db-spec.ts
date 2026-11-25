/**
 * E2E (app completa + base de pruebas): enlace de baja de los avisos de
 * planta. Se abre sin sesión desde el correo; el token firmado identifica al
 * usuario. Una app por archivo (ver README.md).
 */
import request from 'supertest';

import { createUnsubscribeToken } from '../../src/mail/unsubscribe-token.js';
import { User } from '../../src/users/entities/user.entity.js';
import { UsersService } from '../../src/users/users.service.js';
import { API, createE2eApp, type E2eApp } from './e2e-app.js';

describe('E2E: preferencias de correo (enlace de baja)', () => {
  let e2e: E2eApp;
  let token: string;

  beforeAll(async () => {
    e2e = await createE2eApp();
    token = createUnsubscribeToken(
      e2e.base.users.general.id,
      process.env.JWT_SECRET_KEY,
    );
  });

  afterAll(() => e2e?.close());

  const stored = async () =>
    (
      await e2e.dataSource
        .getRepository(User)
        .findOneByOrFail({ id: e2e.base.users.general.id })
    ).plantNotifications;
  const plantRecipients = async () =>
    (
      await e2e.app
        .get(UsersService)
        .findAllByPlant(e2e.base.plants.tepotzotlan.id)
    ).map(({ id }) => id);

  it('sin sesión muestra la preferencia con el correo enmascarado', async () => {
    const res = await e2e
      .call('post', '/mail-preferences/lookup')
      .send({ unsubscribeToken: token })
      .expect(200);

    expect(res.body).toEqual({
      email: expect.stringMatching(/^g•+@hallazgos\.test$/),
      plantNotifications: true,
    });
  });

  it('darse de baja lo saca de los avisos de la planta; volver lo regresa', async () => {
    expect(await plantRecipients()).toContain(e2e.base.users.general.id);

    const res = await e2e
      .call('post', '/mail-preferences')
      .send({ unsubscribeToken: token, plantNotifications: false })
      .expect(200);
    expect(res.body.plantNotifications).toBe(false);
    expect(await stored()).toBe(false);
    expect(await plantRecipients()).not.toContain(e2e.base.users.general.id);

    await e2e
      .call('post', '/mail-preferences')
      .send({ unsubscribeToken: token, plantNotifications: true })
      .expect(200);
    expect(await stored()).toBe(true);
    expect(await plantRecipients()).toContain(e2e.base.users.general.id);
  });

  it('un token alterado responde 404 y no cambia nada', async () => {
    const [, signature] = token.split('.');
    const res = await e2e
      .call('post', '/mail-preferences')
      .send({
        unsubscribeToken: `${e2e.base.users.admin.id}.${signature}`,
        plantNotifications: false,
      })
      .expect(404);

    expect(res.body.message).toBe(
      'El enlace no es válido o la cuenta ya no está activa.',
    );
    expect(await stored()).toBe(true);
  });

  it('un campo de más responde 400 (no se puede tocar otra cosa del usuario)', async () => {
    await e2e
      .call('post', '/mail-preferences')
      .send({ unsubscribeToken: token, plantNotifications: false, role: 'x' })
      .expect(400);
    expect(await stored()).toBe(true);
  });

  // Anti-CSRF: otra página no puede dar de baja a nadie con el enlace.
  it('desde otro sitio responde 403', async () => {
    await request(e2e.server)
      .post(`${API}/mail-preferences`)
      .set('Origin', 'https://sitio-malicioso.example')
      .send({ unsubscribeToken: token, plantNotifications: false })
      .expect(403, /FORBIDDEN_ORIGIN/);
    expect(await stored()).toBe(true);
  });

  it('el administrador ve y cambia la casilla en el usuario', async () => {
    const { id } = e2e.base.users.general;
    const { body: user } = await e2e
      .call('get', `/users/${id}`, e2e.tokens.admin)
      .expect(200);
    expect(user.plantNotifications).toBe(true);

    await e2e
      .call('patch', `/users/${id}`, e2e.tokens.admin)
      .send({
        name: user.name,
        email: user.email,
        rule: user.role,
        manufacturingPlantNames: user.manufacturingPlants.map(
          ({ name }: { name: string }) => name,
        ),
        plantNotifications: false,
      })
      .expect(200);
    expect(await stored()).toBe(false);
  });

  // El enlace de los correos nuevos no lleva token: la página usa la sesión.
  it('con sesión ve y cambia su propia casilla; sin sesión responde 401', async () => {
    await e2e.call('get', '/mail-preferences/me').expect(401);
    await e2e
      .call('patch', '/mail-preferences/me')
      .send({ plantNotifications: false })
      .expect(401);

    const { body } = await e2e
      .call('get', '/mail-preferences/me', e2e.tokens.general)
      .expect(200);
    expect(body).toEqual({
      email: expect.stringMatching(/^g•+@hallazgos\.test$/),
      plantNotifications: false,
    });

    const res = await e2e
      .call('patch', '/mail-preferences/me', e2e.tokens.general)
      .send({ plantNotifications: true })
      .expect(200);
    expect(res.body.plantNotifications).toBe(true);
    expect(await stored()).toBe(true);
  });

  it('con sesión, un campo de más responde 400', async () => {
    await e2e
      .call('patch', '/mail-preferences/me', e2e.tokens.general)
      .send({ plantNotifications: false, unsubscribeToken: token })
      .expect(400);
    expect(await stored()).toBe(true);
  });

  // Al final: agota el límite por IP de este archivo.
  it('limita los intentos por IP (adivinar tokens)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) {
      const res = await e2e
        .call('post', '/mail-preferences/lookup')
        .send({ unsubscribeToken: `1.${'a'.repeat(43)}` });
      statuses.push(res.status);
    }

    expect(statuses).toContain(429);
  });
});
