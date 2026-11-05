import { ConfigService } from '@nestjs/config';
import { DataSource, type EntityManager } from 'typeorm';
import { MailerService } from '@nestjs-modules/mailer';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MailOutboxService } from './mail-outbox.service.js';
import { MailService } from '../mail.service.js';
import { encryptionKey, unseal } from './mail-payload.js';
import { buildEvidence, buildUser } from '../../../test/utils/index.js';

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
