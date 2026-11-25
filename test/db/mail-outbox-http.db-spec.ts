import { mkdtemp, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ISendMailOptions } from '@nestjs-modules/mailer';
import { encryptionKey, unseal } from '../../src/mail/outbox/mail-payload.js';
import { UsersService } from '../../src/users/users.service.js';
import { createE2eApp, type E2eApp } from './e2e-app.js';
import { countMatching, recordQueries } from './query-recorder.js';

describe('HTTP hallazgos with the real transactional mail outbox', () => {
  let app: E2eApp, directory: string;
  let errorLog: jest.SpyInstance;
  const previousKey = process.env.MAIL_OUTBOX_KEY,
    previousDir = process.env.MAIL_OUTBOX_DIR;
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'mail-http-test-'));
    process.env.MAIL_OUTBOX_KEY = 'test-only-key-for-http-transaction';
    process.env.MAIL_OUTBOX_DIR = directory;
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    app = await createE2eApp({ persistentMail: true });
  });
  afterAll(async () => {
    errorLog?.mockRestore();
    if (app) {
      const root = resolve('public/static/images/evidences');
      for (const row of await app.dataSource.query(
        `SELECT "imgEvidence" AS filename FROM evidence WHERE description='atomic outbox test'`,
      )) {
        const target = resolve(root, row.filename);
        if (target.startsWith(root + '/') || target.startsWith(root + '\\'))
          await unlink(target).catch(() => {});
      }
    }
    await app?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
    if (previousKey === undefined) delete process.env.MAIL_OUTBOX_KEY;
    else process.env.MAIL_OUTBOX_KEY = previousKey;
    if (previousDir === undefined) delete process.env.MAIL_OUTBOX_DIR;
    else process.env.MAIL_OUTBOX_DIR = previousDir;
  });
  const create = () =>
    app
      .call('post', '/evidences', app.tokens.general)
      .field({
        manufacturingPlantId: String(app.base.plants.tepotzotlan.id),
        typeHallazgo: String(app.base.mainType.id),
        type: String(app.base.secondaryType.id),
        zone: String(app.base.zone.id),
        process: String(app.base.process.id),
        description: 'atomic outbox test',
        priorityDays: '8',
      })
      .attach(
        'file',
        Buffer.concat([image, Buffer.from([0])]),
        'mail-test.png',
      );
  it('commits the real hallazgo and its deduplicated pending recipients without calling SMTP', async () => {
    let response: Awaited<ReturnType<typeof create>>;
    const queries = await recordQueries(async () => {
      response = await create().expect(201);
    });
    // Todos los destinatarios en un INSERT (antes, uno por destinatario).
    expect(countMatching(queries, /INSERT INTO email_notifications/)).toBe(1);
    const rows = await app.dataSource.query(
      'SELECT * FROM email_notifications WHERE evidence_id=$1',
      [response.body.id],
    );
    // Un correo por aviso, no por persona: el personal (responsables) y el
    // de toda la planta, este con todos en copia oculta. Nadie se repite.
    const plantEmails = (
      await app.app
        .get(UsersService)
        .findAllByPlant(app.base.plants.tepotzotlan.id)
    ).map(({ email }) => email.trim().toLowerCase());
    const recipientsOf = (row: { recipient: string }) =>
      row.recipient.split(', ');
    expect(rows.flatMap(recipientsOf).sort()).toEqual([...plantEmails].sort());
    expect(new Set(rows.map((x) => x.event_id)).size).toBe(1);
    expect(rows.every((x) => x.status === 'pending')).toBe(true);
    const key = encryptionKey(
      app.app.get(ConfigService).get<string>('MAIL_OUTBOX_KEY'),
    );
    const [plantWide] = rows.filter((x) => recipientsOf(x).length > 1);
    const mail = unseal<ISendMailOptions>(plantWide.payload, key);
    expect(mail.to).toBeUndefined();
    expect(mail.bcc).toEqual(recipientsOf(plantWide));
    expect(mail.headers).toEqual({
      'List-Unsubscribe': expect.stringMatching(/\/unsubscribe>$/),
    });
    expect(app.mail.sendCreate).not.toHaveBeenCalled();
  });
  it('rolls back the hallazgo when notification persistence fails', async () => {
    const [{ count: before }] = await app.dataSource.query(
      'SELECT count(*) FROM evidence',
    );
    await app.dataSource.query(
      'ALTER TABLE email_notifications RENAME TO email_notifications_unavailable',
    );
    try {
      await create().expect(500);
    } finally {
      await app.dataSource.query(
        'ALTER TABLE email_notifications_unavailable RENAME TO email_notifications',
      );
    }
    const [{ count: after }] = await app.dataSource.query(
      'SELECT count(*) FROM evidence',
    );
    expect(after).toBe(before);
  });
});
