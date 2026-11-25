import { mkdtemp, writeFile, utimes, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { DataSource } from 'typeorm';
import {
  MailDeliveryService,
  MailLeaseLostError,
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
  it('accepted mail without rejected recipients raises no review event', async () => {
    await processRow();
    expect(Logger.prototype.error).not.toHaveBeenCalled();
  });
  it('accepts a mail with some rejected recipients and asks for review without addresses', async () => {
    sendMail.mockResolvedValue({
      accepted: ['a@test.com'],
      rejected: ['b@test.com', 'c@test.com'],
      messageId: 'message',
    });
    await processRow();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('provider_message_id=$5'),
      expect.arrayContaining(['accepted', 'message']),
    );
    expect(Logger.prototype.error).toHaveBeenCalledWith({
      component: 'mail-worker',
      event: 'mail_review_required',
      notification_id: 'id',
      event_id: 'event',
      category: 'recipients_rejected',
      count: 2,
    });
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
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('provider_message_id'),
      expect.arrayContaining(['dead', 'payload_invalid']),
    );
  });

  describe('reset preparation failures', () => {
    // Estado con el que termina la fila (UPDATE de finish()).
    const finishes = () =>
      query.mock.calls
        .filter(([sql]) => String(sql).includes('provider_message_id=$5'))
        .map(([, args]) => [args[2], args[3]]);
    const resetRow = (overrides: Partial<Notification> = {}) =>
      notification({
        type: 'reset',
        payload: seal(
          {
            to: 'recipient@test.com',
            html: 'reset?token=__COMPORTARTE_RESET_TOKEN__',
            headers: {
              'X-Comportarte-Reset-Token': new JwtService(
                config,
              ).createResetToken(7, 'hash'),
            },
          },
          encryptionKey('test-key'),
        ),
        ...overrides,
      });
    const validUser = () =>
      findOne.mockResolvedValue({
        email: 'recipient@test.com',
        password: 'hash',
      });

    it('retries (not dead) when the user lookup hits a transient DB error', async () => {
      findOne.mockRejectedValue(new Error('connection terminated'));
      await processRow(resetRow());
      expect(sendMail).not.toHaveBeenCalled();
      expect(finishes()).toEqual([['retry_wait', 'reset_preparation_failed']]);
    });

    it('retries when persisting the minted token fails', async () => {
      validUser();
      const defaultQuery = query.getMockImplementation();
      query.mockImplementation(async (sql: string, args?: unknown[]) => {
        if (sql.includes('SET payload=$3,expires_at'))
          throw new Error('canceling statement due to statement timeout');
        return defaultQuery(sql, args);
      });
      await processRow(resetRow());
      expect(sendMail).not.toHaveBeenCalled();
      expect(finishes()).toEqual([['retry_wait', 'reset_preparation_failed']]);
    });

    it('becomes dead once the attempt budget is exhausted', async () => {
      findOne.mockRejectedValue(new Error('connection terminated'));
      await processRow(resetRow({ attempt_count: 8 }));
      expect(finishes()).toEqual([['dead', 'reset_preparation_failed']]);
    });

    it('becomes dead once the notification has expired', async () => {
      findOne.mockRejectedValue(new Error('connection terminated'));
      await processRow(resetRow({ expires_at: new Date(Date.now() - 1000) }));
      expect(finishes()).toEqual([['dead', 'reset_preparation_failed']]);
    });

    it('propagates a lease lost while saving the token without dead-lettering', async () => {
      validUser();
      const defaultQuery = query.getMockImplementation();
      query.mockImplementation(async (sql: string, args?: unknown[]) =>
        sql.includes('SET payload=$3,expires_at')
          ? []
          : defaultQuery(sql, args),
      );
      await expect(processRow(resetRow())).rejects.toBeInstanceOf(
        MailLeaseLostError,
      );
      expect(sendMail).not.toHaveBeenCalled();
      expect(finishes()).toEqual([]);
    });

    it('propagates a failed cancel instead of finishing again as dead', async () => {
      findOne.mockResolvedValue({
        email: 'changed@test.com',
        password: 'hash',
      });
      query.mockResolvedValue([]); // el finish('cancelled') ya no es dueño del lease
      await expect(processRow(resetRow())).rejects.toBeInstanceOf(
        MailLeaseLostError,
      );
      expect(finishes()).toEqual([['cancelled', 'reset_user_changed']]);
    });
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
  describe('attachment cleanup with undecryptable payloads', () => {
    let directory: string, unreferenced: string, referenced: string;
    beforeEach(async () => {
      directory = await mkdtemp(join(tmpdir(), 'mail-gc-invalid-'));
      config.set('MAIL_OUTBOX_DIR', directory);
      unreferenced = join(directory, 'a'.repeat(64));
      referenced = join(directory, 'b'.repeat(64));
      for (const path of [unreferenced, referenced]) {
        await writeFile(path, 'image');
        await utimes(path, new Date(0), new Date(0));
      }
    });
    afterEach(async () => {
      config.set('MAIL_OUTBOX_DIR', undefined);
      await rm(directory, { recursive: true, force: true });
    });
    const payloads = (rows: { payload: string; invalid: boolean }[]) =>
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('pg_try_advisory')) return [{ acquired: true }];
        if (sql.includes('SELECT payload')) return rows;
        return [];
      });
    const valid = () => ({
      payload: seal(
        { attachments: [{ path: referenced }] },
        encryptionKey('test-key'),
      ),
      invalid: false,
    });

    // Antes, una sola fila corrupta (que queda dead con su payload para
    // siempre) abortaba cada limpieza diaria y los blobs crecían sin límite.
    it('skips rows already dead-lettered as payload_invalid and keeps cleaning', async () => {
      payloads([valid(), { payload: 'corrupt', invalid: true }]);
      await service.reconcile();
      expect(await readdir(directory)).toEqual(['b'.repeat(64)]);
      expect(Logger.prototype.error).not.toHaveBeenCalledWith(
        expect.objectContaining({ event: 'mail_attachment_cleanup_failed' }),
      );
    });

    it('still aborts without deleting anything if another payload cannot be decrypted (wrong key)', async () => {
      payloads([valid(), { payload: 'corrupt', invalid: false }]);
      await service.reconcile();
      expect((await readdir(directory)).sort()).toEqual([
        'a'.repeat(64),
        'b'.repeat(64),
      ]);
      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'mail_attachment_cleanup_failed' }),
      );
    });
  });
  it('a recipient-level 5.7.x rejection does not pause the sender account', async () => {
    sendMail.mockRejectedValue({
      responseCode: 550,
      command: 'RCPT TO',
      response: '550 5.7.1 Message rejected by recipient policy',
    });
    await processRow();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('provider_message_id'),
      expect.arrayContaining(['dead', 'smtp_permanent']),
    );
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('paused=true'),
      expect.anything(),
    );
  });
  it('a sender-level 5.7.x rejection still pauses the account', async () => {
    sendMail.mockRejectedValue({
      responseCode: 530,
      command: 'MAIL FROM',
      response: '530 5.7.57 Client not authenticated to send mail',
    });
    await processRow();
    expect(query).toHaveBeenCalledWith(expect.stringContaining('paused=true'), [
      'sender@test.com',
      'authentication',
    ]);
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
  describe('casos de borde', () => {
    const settle = async () => {
      for (let i = 0; i < 10; i++) await new Promise(setImmediate);
    };

    it('event sin campos registra solo el componente y el evento', () => {
      service.event('mail_ping');

      expect(Logger.prototype.log).toHaveBeenCalledWith({
        component: 'mail-worker',
        event: 'mail_ping',
      });
    });

    it('avisa de correos de hallazgos vencidos (no de recuperación)', async () => {
      query.mockImplementation(async (sql: string) =>
        sql.includes("SET status='expired'")
          ? [
              { type: 'evidence', count: '2' },
              { type: 'reset', count: '5' },
              { type: 'evidence', count: null },
            ]
          : [],
      );

      await service.reconcile();

      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'mail_review_required',
          category: 'expired',
          count: 2,
        }),
      );
    });

    it('limpia adjuntos como máximo una vez al día', async () => {
      const cleanup = jest
        .spyOn(service as never, 'cleanupAttachments')
        .mockResolvedValue(undefined as never);
      query.mockResolvedValue([]);

      await service.reconcile();
      await service.reconcile();

      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('sin carpeta de adjuntos no hay nada que limpiar', async () => {
      config.set('MAIL_OUTBOX_DIR', join(tmpdir(), 'no-existe-mail-gc'));
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('pg_try_advisory')) return [{ acquired: true }];
        if (sql.includes('SELECT payload'))
          return [
            { payload: seal({ to: 'a@test.com' }, encryptionKey('test-key')) },
            {
              payload: seal(
                { attachments: [{ content: 'en línea' }] },
                encryptionKey('test-key'),
              ),
            },
          ];
        return [];
      });
      try {
        await service.reconcile();
        expect(Logger.prototype.error).not.toHaveBeenCalledWith(
          expect.objectContaining({ event: 'mail_attachment_cleanup_failed' }),
        );
      } finally {
        config.set('MAIL_OUTBOX_DIR', undefined);
      }
    });

    it('si la carpeta de adjuntos no se puede leer, lo avisa', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'mail-gc-file-'));
      const file = join(directory, 'no-es-carpeta');
      await writeFile(file, 'x');
      config.set('MAIL_OUTBOX_DIR', file);
      query.mockImplementation(async (sql: string) =>
        sql.includes('pg_try_advisory') ? [{ acquired: true }] : [],
      );
      try {
        await service.reconcile();
        expect(Logger.prototype.error).toHaveBeenCalledWith(
          expect.objectContaining({ event: 'mail_attachment_cleanup_failed' }),
        );
      } finally {
        config.set('MAIL_OUTBOX_DIR', undefined);
        await rm(directory, { recursive: true, force: true });
      }
    });

    it('si la fila ya no se puede reclamar, libera el turno de la cuenta', async () => {
      query
        .mockResolvedValueOnce([notification()])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ account: 'sender@test.com' }])
        .mockResolvedValueOnce([]);

      expect(await service.claim('id')).toBeUndefined();
      expect(query).toHaveBeenLastCalledWith(
        expect.stringContaining('SET active_lease=NULL'),
        ['sender@test.com', expect.any(String)],
      );
    });

    it('si la cuenta ya estaba pausada no vuelve a alertar', async () => {
      const defaultQuery = query.getMockImplementation();
      query.mockImplementation(async (sql: string, args?: unknown[]) =>
        sql.includes('paused=true') ? [] : defaultQuery(sql, args),
      );
      sendMail.mockRejectedValue({
        responseCode: 530,
        command: 'MAIL FROM',
        response: '530 5.7.57 Client not authenticated to send mail',
      });

      await processRow();

      expect(Logger.prototype.error).not.toHaveBeenCalledWith(
        expect.objectContaining({ event: 'mail_account_blocked' }),
      );
    });

    it('registra fallos de preparación del reset que no son Error', async () => {
      findOne.mockRejectedValue('sin conexión');
      await processRow(
        notification({
          type: 'reset',
          payload: seal(
            {
              to: 'recipient@test.com',
              headers: {
                'X-Comportarte-Reset-Token': new JwtService(
                  config,
                ).createResetToken(7, 'hash'),
              },
            },
            encryptionKey('test-key'),
          ),
        }),
      );

      expect(Logger.prototype.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'mail_reset_preparation_failed',
          error: 'sin conexión',
        }),
      );
    });

    describe('renovación del lease durante el envío', () => {
      let release: () => void;

      beforeEach(() => {
        jest.useFakeTimers({
          doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
        });
        sendMail.mockImplementation(
          () =>
            new Promise((resolve) => {
              release = () =>
                resolve({ accepted: ['recipient@test.com'], messageId: 'm' });
            }),
        );
      });

      afterEach(() => jest.useRealTimers());

      it('cada 30 s extiende el lease de la cuenta y de la fila', async () => {
        const sending = processRow();
        await settle();

        jest.advanceTimersByTime(30_000);
        await settle();
        release();
        await sending;

        expect(query).toHaveBeenCalledWith(
          expect.stringContaining('SET active_until=now()'),
          ['sender@test.com', 'lease'],
        );
        expect(query).toHaveBeenCalledWith(
          expect.stringContaining('SET locked_until=now()'),
          ['id', 'lease'],
        );
      });

      it('si no se puede renovar el lease, lo avisa', async () => {
        const defaultQuery = query.getMockImplementation();
        query.mockImplementation(async (sql: string, args?: unknown[]) => {
          if (sql.includes('SET active_until=now()'))
            throw new Error('BD caída');
          return defaultQuery(sql, args);
        });
        const sending = processRow();
        await settle();

        jest.advanceTimersByTime(30_000);
        await settle();
        release();
        await sending;

        expect(Logger.prototype.error).toHaveBeenCalledWith(
          expect.objectContaining({ event: 'mail_lease_refresh_failed' }),
        );
      });
    });
  });
});
