import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, type EntityManager } from 'typeorm';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { ISendMailOptions } from '@nestjs-modules/mailer';
import { encryptionKey, freezeMail, seal } from './mail-payload.js';

type Capture = {
  manager: EntityManager;
  event: string;
  type: string;
  evidenceId?: number;
  userId?: number;
  expires: Date;
  recipients: Set<string>;
};

@Injectable()
export class MailOutboxService {
  private readonly context = new AsyncLocalStorage<Capture>();
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}
  get capturing(): boolean {
    return !!this.context.getStore();
  }
  async capture<T>(
    manager: EntityManager,
    work: () => Promise<T>,
    type = 'evidence',
    userId?: number,
  ): Promise<T> {
    const expires = new Date(
      Date.now() + (type === 'reset' ? 240_000 : 86_400_000),
    );
    return this.context.run(
      {
        manager,
        event: randomUUID(),
        type,
        userId,
        expires,
        recipients: new Set(),
      },
      work,
    );
  }
  async reset(work: () => Promise<void>, userId?: number): Promise<void> {
    await this.db.transaction(async (manager) => {
      if (userId) {
        // Serialize requests for the same user before cancelling old pending requests.
        await manager.query('SELECT pg_advisory_xact_lock(721, $1)', [userId]);
        await manager.query(
          `UPDATE email_notifications SET status='cancelled',payload=NULL,updated_at=now()
          WHERE type='reset' AND user_id=$1 AND status IN ('pending','retry_wait','blocked')`,
          [userId],
        );
      }
      await this.capture(manager, work, 'reset', userId);
    });
  }
  async enqueue(options: ISendMailOptions): Promise<void> {
    const ctx = this.context.getStore();
    if (!ctx) throw new Error('Persistent mail requires a transaction');
    const recipient = String(options.to).trim().toLowerCase();
    if (ctx.recipients.has(recipient)) return;
    ctx.recipients.add(recipient);
    const match = /Hallazgo #(\d+)/.exec(String(options.subject));
    const id = randomUUID();
    const key = encryptionKey(this.config.get<string>('MAIL_OUTBOX_KEY'));
    // Coordinate immutable blob creation with the daily garbage collector.
    await ctx.manager.query('SELECT pg_advisory_xact_lock_shared(722, 1)');
    const frozen = await freezeMail(
      options,
      this.config.get<string>('MAIL_OUTBOX_DIR') || 'var/mail-outbox/blobs',
    );
    frozen.messageId = `<${id}@comportarte.com>`;
    await ctx.manager.query(
      `INSERT INTO email_notifications
      (id,event_id,recipient,provider_account,type,evidence_id,user_id,payload,expires_at,priority,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        CASE WHEN coalesce((SELECT paused FROM email_provider_state WHERE account=$4),false) THEN 'blocked' ELSE 'pending' END) ON CONFLICT (event_id,recipient) DO NOTHING`,
      [
        id,
        ctx.event,
        recipient,
        this.config.get<string>('MAIL_USER'),
        ctx.type === 'reset'
          ? 'reset'
          : String(options.template).replace('./', ''),
        match ? Number(match[1]) : null,
        ctx.userId ?? null,
        seal(frozen, key),
        ctx.expires,
        ctx.type === 'reset' ? 1 : 10,
      ],
    );
  }
}
