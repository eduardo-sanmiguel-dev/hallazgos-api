import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { MailerService, type ISendMailOptions } from '@nestjs-modules/mailer';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { CreateMailOutbox1793900000000 } from '../../src/migrations/1793900000000-create-mail-outbox.js';
import { MailOutboxService } from '../../src/mail/outbox/mail-outbox.service.js';
import { MailDeliveryService } from '../../src/mail/outbox/mail-delivery.service.js';
import { MailService } from '../../src/mail/mail.service.js';
import {
  encryptionKey,
  seal,
  unseal,
} from '../../src/mail/outbox/mail-payload.js';
import { buildEvidence, buildUser } from '../utils/index.js';
import { createTestDataSource, recreateTestSchema } from './test-database.js';

describe('Mail outbox: real PostgreSQL, controlled SMTP transport', () => {
  let db: DataSource;
  let directory: string;
  let config: ConfigService;
  let outbox: MailOutboxService;
  let mail: MailService;
  let delivery: MailDeliveryService;
  let sendMail: jest.Mock;
  let log: jest.SpyInstance;
  let errorLog: jest.SpyInstance;
  const key = encryptionKey('integration-test-only');

  beforeAll(async () => {
    await recreateTestSchema();
    db = createTestDataSource();
    await db.initialize();
    const runner = db.createQueryRunner();
    await new CreateMailOutbox1793900000000().up(runner);
    await runner.release();
    directory = await mkdtemp(join(tmpdir(), 'comportarte-mail-test-'));
    config = new ConfigService({
      MAIL_USER: 'sender@example.test',
      MAIL_OUTBOX_KEY: 'integration-test-only',
      MAIL_OUTBOX_DIR: directory,
      email: { user: 'sender@example.test' },
      environment: 'production',
      frontendUrl: 'https://example.test',
      NODE_ENV: 'production',
    });
    outbox = new MailOutboxService(db, config);
    sendMail = jest
      .fn()
      .mockResolvedValue({
        accepted: ['recipient@example.test'],
        messageId: 'accepted-test',
      });
    const transport = { sendMail } as unknown as MailerService;
    mail = new MailService(transport, config, outbox);
    delivery = new MailDeliveryService(db, config, transport);
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    await db.query('CREATE TABLE mail_atomicity_probe(id integer)');
  });
  beforeEach(async () => {
    await db.query(
      'TRUNCATE email_attempts,email_notifications,email_provider_state,mail_atomicity_probe RESTART IDENTITY',
    );
    sendMail
      .mockReset()
      .mockResolvedValue({
        accepted: ['recipient@example.test'],
        messageId: 'accepted-test',
      });
  });
  afterAll(async () => {
    log?.mockRestore();
    errorLog?.mockRestore();
    await db?.destroy();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  async function pending(type = 'evidence') {
    const id = randomUUID();
    await db.query(
      `INSERT INTO email_notifications(id,event_id,recipient,provider_account,type,payload,expires_at)
      VALUES($1,$2,'recipient@example.test','sender@example.test',$3,$4,now()+interval '24 hours')`,
      [
        id,
        randomUUID(),
        type,
        seal(
          {
            to: 'recipient@example.test',
            from: 'sender@example.test',
            subject: 'test',
            html: 'test',
          },
          key,
        ),
      ],
    );
    return id;
  }
  async function row(id: string) {
    return (
      await db.query('SELECT * FROM email_notifications WHERE id=$1', [id])
    )[0];
  }
  async function render() {
    await mail.sendCreate({
      user: buildUser({ email: 'recipient@example.test' }),
      evidenceCurrent: buildEvidence({ imgEvidence: '', supervisors: [] }),
    });
  }

  it('commits frozen HTML and immutable attachments once per event/recipient without SMTP', async () => {
    await db.transaction((manager) =>
      mail.withOutbox(manager, async () => {
        await render();
        await render();
      }),
    );
    const rows = await db.query('SELECT * FROM email_notifications');
    expect(rows).toHaveLength(1);
    expect(sendMail).not.toHaveBeenCalled();
    const data = unseal<ISendMailOptions>(rows[0].payload, key);
    expect(data.html).toContain('Hallazgo');
    expect(data.template).toBeUndefined();
    expect(data.attachments).toHaveLength(2);
    for (const attachment of data.attachments as { path: string }[])
      expect((await readFile(attachment.path)).length).toBeGreaterThan(0);
  });
  it('rolls back business changes and pending mail together', async () => {
    await expect(
      db.transaction((manager) =>
        mail.withOutbox(manager, async () => {
          await manager.query('INSERT INTO mail_atomicity_probe VALUES(1)');
          await render();
          throw new Error('abort');
        }),
      ),
    ).rejects.toThrow('abort');
    expect(await db.query('SELECT * FROM email_notifications')).toHaveLength(0);
    expect(await db.query('SELECT * FROM mail_atomicity_probe')).toHaveLength(
      0,
    );
  });
  it('rejects sending outside an outbox transaction', async () => {
    await expect(render()).rejects.toThrow('transaction');
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('allows only one competing worker to claim a message', async () => {
    const id = await pending();
    const claims = await Promise.all([delivery.claim(id), delivery.claim(id)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect((await row(id)).attempt_count).toBe(1);
  });
  it('limits simultaneous sends globally across different notifications', async () => {
    const first = await pending(),
      second = await pending();
    const claims = await Promise.all([
      delivery.claim(first),
      delivery.claim(second),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });
  it('records SMTP acceptance and never resends an accepted message', async () => {
    const id = await pending();
    await delivery.process(id);
    await delivery.process(id);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(await row(id)).toMatchObject({
      status: 'accepted',
      payload: null,
      provider_message_id: 'accepted-test',
    });
  });
  it('schedules a temporary failure, then recovers with a new worker', async () => {
    const id = await pending();
    sendMail.mockRejectedValueOnce({ responseCode: 451 });
    await delivery.process(id);
    expect(await row(id)).toMatchObject({
      status: 'retry_wait',
      attempt_count: 1,
    });
    await db.query(
      'UPDATE email_notifications SET next_attempt_at=now() WHERE id=$1',
      [id],
    );
    await db.query('UPDATE email_provider_state SET next_send_at=now()');
    await new MailDeliveryService(db, config, {
      sendMail,
    } as unknown as MailerService).process(id);
    expect((await row(id)).status).toBe('accepted');
  });
  it('pauses all pending messages for a sender with storage quota exceeded', async () => {
    const id = await pending(),
      other = await pending();
    sendMail.mockRejectedValueOnce({
      responseCode: 554,
      response:
        'STOREDRV.Submission.Exception:QuotaExceededException.MapiExceptionStorageOverQuotaLimitExceeded',
    });
    await delivery.process(id);
    await delivery.process(other);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect((await row(other)).status).toBe('blocked');
    expect(await delivery.due()).toHaveLength(0);
  });
  it('keeps an interrupted send uncertain after reboot and recovers untouched pending mail', async () => {
    const id = await pending();
    await delivery.claim(id);
    const untouched = await pending();
    await db.query(
      "UPDATE email_notifications SET locked_until=now()-interval '1 minute' WHERE id=$1",
      [id],
    );
    const restarted = new MailDeliveryService(db, config, {
      sendMail,
    } as unknown as MailerService);
    await restarted.reconcile();
    expect((await row(id)).status).toBe('uncertain');
    expect((await restarted.due()).map((x) => x.id)).toContain(untouched);
    await restarted.process(id);
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('does not automatically resend when SMTP result is ambiguous', async () => {
    const id = await pending();
    sendMail.mockRejectedValueOnce({ code: 'ETIMEDOUT', command: 'DATA' });
    await delivery.process(id);
    expect((await row(id)).status).toBe('uncertain');
  });
  it('expires old pending mail instead of sending stale notifications', async () => {
    const id = await pending();
    await db.query(
      "UPDATE email_notifications SET expires_at=now()-interval '1 minute' WHERE id=$1",
      [id],
    );
    await delivery.reconcile();
    await delivery.process(id);
    expect((await row(id)).status).toBe('expired');
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('dead-letters an invalid recipient and exhausted retries', async () => {
    const id = await pending();
    sendMail.mockRejectedValueOnce({ responseCode: 550, response: '5.1.1' });
    await delivery.process(id);
    expect((await row(id)).status).toBe('dead');
    const second = await pending();
    await db.query('UPDATE email_provider_state SET next_send_at=now()');
    await db.query(
      'UPDATE email_notifications SET attempt_count=7 WHERE id=$1',
      [second],
    );
    sendMail.mockRejectedValueOnce({ responseCode: 451 });
    await delivery.process(second);
    expect((await row(second)).status).toBe('dead');
  });
  it('does not turn a database failure after SMTP acceptance into a retry', async () => {
    const id = await pending();
    sendMail.mockImplementationOnce(async () => {
      await db.query(
        'ALTER TABLE email_attempts RENAME TO email_attempts_unavailable',
      );
      return { accepted: ['recipient@example.test'], messageId: 'accepted' };
    });
    try {
      await expect(delivery.process(id)).rejects.toThrow();
      expect((await row(id)).status).toBe('sending');
    } finally {
      await db.query(
        'ALTER TABLE email_attempts_unavailable RENAME TO email_attempts',
      );
    }
    await db.query(
      "UPDATE email_notifications SET locked_until=now()-interval '1 minute' WHERE id=$1",
      [id],
    );
    await delivery.reconcile();
    expect((await row(id)).status).toBe('uncertain');
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
