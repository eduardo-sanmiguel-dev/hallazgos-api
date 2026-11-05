import { mkdtemp, writeFile, utimes, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { DataSource } from 'typeorm';
import {
  MailDeliveryService,
  type Notification,
} from './mail-delivery.service.js';
import { encryptionKey, seal } from './mail-payload.js';
import { JwtService } from '../../auth/jwt.service.js';

describe('MailDeliveryService', () => {
  const config = new ConfigService({
    MAIL_USER: 'sender@test.com',
    MAIL_OUTBOX_KEY: 'test-key',
    NODE_ENV: 'production',
    jwt: { secretKey: 'test-only' },
  });
  let service: MailDeliveryService,
    query: jest.Mock,
    sendMail: jest.Mock,
    findOne: jest.Mock;
  const notification = (
    overrides: Partial<Notification> = {},
  ): Notification => ({
    id: 'id',
    event_id: 'event',
    provider_account: 'sender@test.com',
    type: 'evidence',
    user_id: 7,
    payload: seal(
      { to: 'recipient@test.com', html: 'test' },
      encryptionKey('test-key'),
    ),
    attempt_count: 1,
    max_attempts: 8,
    expires_at: new Date(Date.now() + 86400000),
    lease_token: 'lease',
    priority: 10,
    ...overrides,
  });
  beforeEach(() => {
    query = jest
      .fn()
      .mockResolvedValue([{ id: 'id', account: 'sender@test.com' }]);
    findOne = jest.fn();
    const manager = { query };
    const db = {
      query,
      transaction: async (callback) => callback(manager),
      getRepository: () => ({ findOne }),
    } as unknown as DataSource;
    sendMail = jest.fn().mockResolvedValue({
      accepted: ['recipient@test.com'],
      messageId: 'message',
    });
    service = new MailDeliveryService(db, config, {
      sendMail,
    } as unknown as MailerService);
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());
  const processRow = (row = notification()) => {
    jest.spyOn(service, 'claim').mockResolvedValue(row);
    return service.process(row.id);
  };

  it('ignores jobs that have already been claimed or completed', async () => {
    jest.spyOn(service, 'claim').mockResolvedValue(undefined);
    await service.process('id');
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('records acceptance separately from SMTP failures', async () => {
    await processRow();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('provider_message_id=$5'),
      expect.arrayContaining(['accepted', 'message']),
    );
  });
  it.each([
    [{ responseCode: 451 }, 'retry_wait'],
    [{ responseCode: 550 }, 'dead'],
    [{ code: 'ETIMEDOUT', command: 'DATA' }, 'uncertain'],
    [
      { responseCode: 554, response: 'STOREDRV.Submission Mailbox full' },
      'blocked',
    ],
  ])('handles rejection %j', async (error, status) => {
    sendMail.mockRejectedValue(error);
    await processRow();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status='sending' RETURNING"),
      expect.arrayContaining([status]),
    );
  });
  it('stops after the attempt budget', async () => {
    sendMail.mockRejectedValue({ responseCode: 451 });
    await processRow(notification({ attempt_count: 8 }));
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('provider_message_id'),
      expect.arrayContaining(['dead']),
    );
  });
  it('does not send corrupt payloads', async () => {
    await processRow(notification({ payload: 'invalid' }));
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('keeps a result uncertain without an acceptance confirmation', async () => {
    sendMail.mockResolvedValue({});
    await processRow();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('provider_message_id'),
      expect.arrayContaining(['uncertain']),
    );
  });
  it('propagates DB failure after SMTP success without retrying SMTP', async () => {
    query.mockRejectedValue(new Error('db down'));
    await expect(processRow()).rejects.toThrow('db down');
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
  it('refuses to finish work owned by another lease', async () => {
    query.mockResolvedValue([]);
    await expect(processRow()).rejects.toThrow('lease');
  });
  it('expires recovery mail with an invalid token', async () => {
    findOne.mockResolvedValue({
      email: 'recipient@test.com',
      password: 'hash',
    });
    await processRow(
      notification({
        type: 'reset',
        payload: seal(
          {
            to: 'recipient@test.com',
            headers: { 'X-Comportarte-Reset-Token': 'invalid' },
          },
          encryptionKey('test-key'),
        ),
      }),
    );
    expect(sendMail).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('provider_message_id'),
      expect.arrayContaining(['expired']),
    );
  });
  it('cancels recovery if the account email changed', async () => {
    findOne.mockResolvedValue({ email: 'changed@test.com', password: 'hash' });
    await processRow(notification({ type: 'reset' }));
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('sends a valid recovery without exposing the internal token header', async () => {
    const token = new JwtService(config).createResetToken(7, 'hash');
    findOne.mockResolvedValue({
      email: 'recipient@test.com',
      password: 'hash',
    });
    await processRow(
      notification({
        type: 'reset',
        payload: seal(
          {
            to: 'recipient@test.com',
            headers: { 'X-Comportarte-Reset-Token': token },
          },
          encryptionKey('test-key'),
        ),
      }),
    );
    expect(sendMail.mock.calls[0][0].headers).toBeUndefined();
  });
  it('reconciles interrupted leases and expires stale pending mail', async () => {
    await service.reconcile();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('worker_interrupted'),
    );
    expect(Logger.prototype.error).toHaveBeenCalled();
  });
  it('returns due notifications for the dispatcher', async () => {
    await service.due();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('NOT coalesce(p.paused,false)'),
    );
  });
  it('claims a due row and records its attempt before transport', async () => {
    query
      .mockResolvedValueOnce([notification()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ account: 'sender@test.com' }])
      .mockResolvedValueOnce([notification()])
      .mockResolvedValueOnce([]);
    expect(await service.claim('id')).toMatchObject({ id: 'id' });
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('does not claim locked, paused or rate-limited work', async () => {
    query.mockResolvedValueOnce([]);
    expect(await service.claim('id')).toBeUndefined();
    query
      .mockResolvedValueOnce([notification()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    expect(await service.claim('id')).toBeUndefined();
  });
  it('blocks a job if its configured sender was changed', async () => {
    query.mockResolvedValueOnce([
      notification({ provider_account: 'other@test.com' }),
    ]);
    await service.claim('id');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('sender_changed'),
      ['id'],
    );
  });
  it('publishes heartbeat and backlog metrics', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ pending: 4, oldest_seconds: 400 }]);
    await service.metrics();
    expect(Logger.prototype.error).toHaveBeenCalled();
  });
  it('does not alert on an empty backlog', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ pending: 0, oldest_seconds: 0 }]);
    await service.metrics();
    expect(Logger.prototype.error).not.toHaveBeenCalled();
  });
  it('removes only old unreferenced attachment snapshots under the configured directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mail-gc-test-'));
    config.set('MAIL_OUTBOX_DIR', directory);
    const unreferenced = join(directory, 'a'.repeat(64)),
      referenced = join(directory, 'b'.repeat(64));
    try {
      for (const path of [unreferenced, referenced]) {
        await writeFile(path, 'image');
        await utimes(path, new Date(0), new Date(0));
      }
      await writeFile(join(directory, 'keep.txt'), 'unrelated');
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('pg_try_advisory')) return [{ acquired: true }];
        if (sql.includes('SELECT payload'))
          return [
            {
              payload: seal(
                { attachments: [{ path: referenced }] },
                encryptionKey('test-key'),
              ),
            },
          ];
        return [];
      });
      await service.reconcile();
      expect(await readdir(directory)).toEqual(['b'.repeat(64), 'keep.txt']);
    } finally {
      config.set('MAIL_OUTBOX_DIR', undefined);
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('does not block dispatch if safe attachment cleanup fails', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('pg_try_advisory')) return [{ acquired: true }];
      if (sql.includes('SELECT payload')) return [{ payload: 'invalid' }];
      return [];
    });
    await expect(service.reconcile()).resolves.toBeUndefined();
    expect(Logger.prototype.error).toHaveBeenCalled();
  });
  it('mints a reset token at the first eligible attempt and persists it before SMTP', async () => {
    const token = new JwtService(config).createResetToken(7, 'hash');
    findOne.mockResolvedValue({
      email: 'recipient@test.com',
      password: 'hash',
    });
    await processRow(
      notification({
        type: 'reset',
        payload: seal(
          {
            to: 'recipient@test.com',
            html: 'reset?token=__COMPORTARTE_RESET_TOKEN__',
            headers: { 'X-Comportarte-Reset-Token': token },
          },
          encryptionKey('test-key'),
        ),
      }),
    );
    expect(sendMail.mock.calls[0][0].html).not.toContain(
      '__COMPORTARTE_RESET_TOKEN__',
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SET payload=$3,expires_at'),
      expect.any(Array),
    );
  });
});
