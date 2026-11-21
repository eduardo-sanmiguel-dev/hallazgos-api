import { ConfigService } from '@nestjs/config';
import { DataSource, type EntityManager } from 'typeorm';
import { MailerService } from '@nestjs-modules/mailer';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MailOutboxService } from './mail-outbox.service.js';
import { MailService } from '../mail.service.js';
import { encryptionKey, unseal } from './mail-payload.js';
import {
  buildEvidence,
  buildUser,
  spanRecorder,
} from '../../../test/utils/index.js';

describe('MailOutboxService', () => {
  let directory: string,
    service: MailOutboxService,
    mail: MailService,
    query: jest.Mock,
    manager: EntityManager;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'mail-unit-'));
    query = jest.fn().mockResolvedValue([]);
    manager = { query } as unknown as EntityManager;
    const config = new ConfigService({
      MAIL_OUTBOX_KEY: 'test',
      MAIL_OUTBOX_DIR: directory,
      MAIL_USER: 'sender@test.com',
      email: { user: 'sender@test.com' },
      environment: 'production',
    });
    service = new MailOutboxService(
      {
        transaction: async (callback) => callback(manager),
      } as unknown as DataSource,
      config,
    );
    mail = new MailService(
      { sendMail: jest.fn() } as unknown as MailerService,
      config,
      service,
    );
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  const create = () =>
    mail.sendCreate({
      user: buildUser({ email: 'person@test.com' }),
      evidenceCurrent: buildEvidence({ imgEvidence: '', supervisors: [] }),
    });
  it('captures a frozen encrypted notification using the caller transaction', async () => {
    await mail.withOutbox(manager, async () => {
      expect(mail.capturingMail).toBe(true);
      await create();
    });
    expect(mail.capturingMail).toBe(false);
    const args = query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO email_notifications'),
    )[1];
    expect(args[2]).toBe('person@test.com');
    expect(
      unseal<{ html: string }>(args[7], encryptionKey('test')).html,
    ).toContain('Hallazgo');
  });
  const sqlCalls = (fragment: string) =>
    query.mock.calls.filter(([sql]) => sql.includes(fragment));
  // Uno tras otro, como EvidencesService.sendEmailUsers.
  const createFor = async (...emails: string[]) => {
    const evidence = buildEvidence({ imgEvidence: '', supervisors: [] });
    for (const email of emails)
      await mail.sendCreate({
        user: buildUser({ email }),
        evidenceCurrent: evidence,
      });
  };
  it('takes the blob lock once per event, before the first notification', async () => {
    await mail.withOutbox(manager, () =>
      createFor('a@test.com', 'b@test.com', 'c@test.com'),
    );
    const sql = query.mock.calls.map(([statement]) => statement as string);
    expect(sqlCalls('pg_advisory_xact_lock_shared(722, 1)')).toHaveLength(1);
    expect(sql[0]).toContain('pg_advisory_xact_lock_shared(722, 1)');
  });
  // Parámetros de cada fila de los INSERT (10 por destinatario).
  const insertedRows = () =>
    sqlCalls('INSERT INTO email_notifications').flatMap(([, args]) =>
      Array.from({ length: args.length / 10 }, (_, row) =>
        args.slice(row * 10, row * 10 + 10),
      ),
    );
  it('inserts every recipient of the event with a single INSERT (no N+1)', async () => {
    await mail.withOutbox(manager, () =>
      createFor('a@test.com', 'b@test.com', 'c@test.com'),
    );
    const inserts = sqlCalls('INSERT INTO email_notifications');
    expect(inserts).toHaveLength(1);
    const [sql, args] = inserts[0];
    expect(args).toHaveLength(30);
    // Cada fila revisa la pausa de su propia cuenta de envío.
    expect(sql).toContain('account=$4)');
    expect(sql).toContain('account=$14)');
    expect(sql).toContain('account=$24)');
    expect(sql).toContain('$30,');
    expect(insertedRows().map((row) => row[2])).toEqual([
      'a@test.com',
      'b@test.com',
      'c@test.com',
    ]);
    // Todos del mismo evento.
    expect(new Set(insertedRows().map((row) => row[1])).size).toBe(1);
  });
  it('splits very large events in INSERTs of 500 recipients', async () => {
    const emails = Array.from({ length: 501 }, (_, i) => `u${i}@test.com`);
    await mail.withOutbox(manager, () => createFor(...emails));
    expect(
      sqlCalls('INSERT INTO email_notifications').map(
        ([, args]) => args.length,
      ),
    ).toEqual([5000, 10]);
    expect(insertedRows().map((row) => row[2])).toEqual(emails);
  });
  it('inserts nothing when the work fails or sends no mail', async () => {
    await expect(
      mail.withOutbox(manager, async () => {
        await createFor('a@test.com');
        throw new Error('falló el alta');
      }),
    ).rejects.toThrow('falló el alta');
    await mail.withOutbox(manager, async () => undefined);
    expect(sqlCalls('INSERT INTO email_notifications')).toHaveLength(0);
  });
  it('takes the blob lock again in each new event (transaction)', async () => {
    await mail.withOutbox(manager, () => createFor('a@test.com'));
    await mail.withOutbox(manager, () => createFor('b@test.com'));
    expect(sqlCalls('pg_advisory_xact_lock_shared(722, 1)')).toHaveLength(2);
  });
  it('does not insert notifications when the blob lock fails', async () => {
    query.mockRejectedValueOnce(new Error('lock timeout'));
    await expect(
      mail.withOutbox(manager, () => createFor('a@test.com', 'b@test.com')),
    ).rejects.toThrow('lock timeout');
    expect(sqlCalls('INSERT INTO email_notifications')).toHaveLength(0);
  });
  it('shares the rendered HTML between recipients but seals each one with its own address', async () => {
    await mail.withOutbox(manager, () => createFor('a@test.com', 'b@test.com'));
    const payloads = insertedRows().map((args) =>
      unseal<{ to: string; html: string }>(
        args[7] as string,
        encryptionKey('test'),
      ),
    );
    expect(payloads.map(({ to }) => to)).toEqual(['a@test.com', 'b@test.com']);
    expect(payloads[1].html).toBe(payloads[0].html);
    expect(payloads[0].html).toContain('Hallazgo');
  });
  it('traces the freezing of each recipient with its template', async () => {
    const recorder = spanRecorder();
    recorder.install();
    try {
      await mail.withOutbox(manager, () =>
        createFor('a@test.com', 'b@test.com'),
      );
    } finally {
      recorder.uninstall();
    }
    expect(recorder.spans).toEqual([
      expect.objectContaining({
        name: 'mail.freeze',
        attributes: { 'mail.template': './create' },
        ended: true,
      }),
      expect.objectContaining({ name: 'mail.freeze', ended: true }),
    ]);
  });
  it('serializes password requests and cancels superseded pending ones', async () => {
    await mail.sendForgotPassword('person@test.com', 'secret-token', 7);
    expect(query.mock.calls[0]).toEqual([
      expect.stringContaining('pg_advisory_xact_lock'),
      [7],
    ]);
    const insert = query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO email_notifications'),
    );
    expect(insert[1][4]).toBe('reset');
    expect(insert[1][9]).toBe(1);
    expect(insert[1][7]).not.toContain('secret-token');
  });
  it('no duplicates a recipient within the same event (case and spaces ignored)', async () => {
    await mail.withOutbox(manager, () =>
      createFor('a@test.com', ' A@test.com '),
    );
    expect(insertedRows()).toHaveLength(1);
  });
  it('without MAIL_OUTBOX_DIR stores blobs in var/mail-outbox/blobs', async () => {
    const previous = process.cwd();
    process.chdir(directory);
    try {
      const defaults = new MailOutboxService(
        {
          transaction: async (callback) => callback(manager),
        } as unknown as DataSource,
        new ConfigService({
          MAIL_OUTBOX_KEY: 'test',
          MAIL_USER: 'sender@test.com',
        }),
      );
      const plain = new MailService(
        { sendMail: jest.fn() } as unknown as MailerService,
        new ConfigService({
          email: { user: 'sender@test.com' },
          environment: 'production',
        }),
        defaults,
      );
      await plain.withOutbox(manager, () =>
        plain.sendCreate({
          user: buildUser({ email: 'a@test.com' }),
          evidenceCurrent: buildEvidence({ imgEvidence: '', supervisors: [] }),
        }),
      );
      expect(existsSync(join(directory, 'var', 'mail-outbox', 'blobs'))).toBe(
        true,
      );
    } finally {
      process.chdir(previous);
    }
  });
  it('requires a transaction to enqueue', async () => {
    await expect(service.enqueue({})).rejects.toThrow('transaction');
  });
  it('supports a reset without a user id only for isolated callers', async () => {
    await service.reset(async () => {});
    expect(query).not.toHaveBeenCalled();
  });
  it('propagates persistence errors instead of reporting enqueue success', async () => {
    query.mockRejectedValue(new Error('database unavailable'));
    await expect(mail.withOutbox(manager, create)).rejects.toThrow(
      'database unavailable',
    );
  });
});
