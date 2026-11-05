import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService, type ISendMailOptions } from '@nestjs-modules/mailer';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { readdir, stat, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { JwtService } from '../../auth/jwt.service.js';
import { User } from '../../users/entities/user.entity.js';
import { classifyMailError, retryDelay } from './mail-policy.js';
import {
  encryptionKey,
  unseal,
  seal,
  RESET_TOKEN_PLACEHOLDER,
} from './mail-payload.js';

export interface Notification {
  id: string;
  event_id: string;
  provider_account: string;
  type: string;
  user_id: number;
  payload: string;
  attempt_count: number;
  max_attempts: number;
  expires_at: Date;
  lease_token: string;
  priority: number;
}

@Injectable()
export class MailDeliveryService {
  private readonly logger = new Logger('MailWorker');
  private lastCleanup = 0;
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
  ) {}

  event(event: string, fields: Record<string, unknown> = {}, alert = false) {
    const record = { component: 'mail-worker', event, ...fields };
    if (alert) this.logger.error(record);
    else this.logger.log(record);
  }

  async reconcile(): Promise<void> {
    // Never retry an interrupted SMTP attempt blindly: it may have been accepted.
    const lost: { id: string }[] = await this.db
      .query(`WITH changed AS (UPDATE email_notifications
      SET status='uncertain',last_error_category='worker_interrupted',lease_token=NULL,locked_until=NULL,updated_at=now()
      WHERE status='sending' AND locked_until < now() RETURNING id) SELECT * FROM changed`);
    if (lost.length)
      this.event(
        'mail_review_required',
        { category: 'worker_interrupted', count: lost.length },
        true,
      );
    const expired: { type: string; count: string }[] = await this.db
      .query(`WITH changed AS (
      UPDATE email_notifications SET status='expired',payload=NULL,updated_at=now()
      WHERE status IN ('pending','retry_wait','blocked') AND expires_at <= now() RETURNING type)
      SELECT type,count(*) AS count FROM changed GROUP BY type`);
    const expiredEvidence = expired
      .filter((row) => row.type !== 'reset')
      .reduce((count, row) => count + Number(row.count || 0), 0);
    if (expiredEvidence)
      this.event(
        'mail_review_required',
        { category: 'expired', count: expiredEvidence },
        true,
      );
    await this.db
      .query(`UPDATE email_attempts a SET result='uncertain',category='worker_interrupted'
      FROM email_notifications n WHERE a.notification_id=n.id AND n.status='uncertain' AND a.result='sending'`);
    // Payloads contain PII/tokens; retain only unresolved ones and purge old audit rows.
    await this.db.query(
      `UPDATE email_notifications SET payload=NULL WHERE status IN ('cancelled','expired','accepted') AND payload IS NOT NULL`,
    );
    await this.db.query(
      `DELETE FROM email_attempts WHERE created_at < now()-interval '30 days'`,
    );
    await this.db.query(
      `DELETE FROM email_notifications WHERE status IN ('accepted','expired','cancelled') AND updated_at < now()-interval '90 days'`,
    );
    if (Date.now() - this.lastCleanup > 86_400_000) {
      await this.cleanupAttachments().catch(() =>
        this.event('mail_attachment_cleanup_failed', {}, true),
      );
      this.lastCleanup = Date.now();
    }
  }

  private async cleanupAttachments() {
    const root = resolve(
      this.config.get<string>('MAIL_OUTBOX_DIR') || 'var/mail-outbox/blobs',
    );
    await this.db.transaction(async (manager) => {
      const [lock] = await manager.query(
        'SELECT pg_try_advisory_xact_lock(722,1) AS acquired',
      );
      if (!lock.acquired) return;
      const referenced = new Set<string>();
      const key = encryptionKey(this.config.get<string>('MAIL_OUTBOX_KEY'));
      // Decrypt every retained payload before deleting anything. A wrong key aborts cleanup safely.
      for (const row of await manager.query(
        'SELECT payload FROM email_notifications WHERE payload IS NOT NULL',
      )) {
        const options = unseal<ISendMailOptions>(row.payload, key);
        for (const attachment of (options.attachments ?? []) as {
          path?: string;
        }[]) {
          if (attachment.path) referenced.add(resolve(attachment.path));
        }
      }
      let names: string[];
      try {
        names = await readdir(root);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }
      for (const name of names) {
        // Only our direct blob children and abandoned temporary files are eligible.
        if (!/^(?:[a-f0-9]{64}|[a-f0-9-]{36}\.tmp)$/.test(name)) continue;
        const path = join(root, name);
        if (
          !referenced.has(path) &&
          (await stat(path)).mtimeMs < Date.now() - 86_400_000
        )
          await unlink(path);
      }
    });
  }

  async due(): Promise<{ id: string; priority: number }[]> {
    return this.db.query(`SELECT n.id,n.priority FROM email_notifications n
      LEFT JOIN email_provider_state p ON p.account=n.provider_account
      WHERE n.status IN ('pending','retry_wait') AND n.next_attempt_at<=now()
        AND n.expires_at>now() AND NOT coalesce(p.paused,false)
      ORDER BY n.priority,n.next_attempt_at LIMIT 100`);
  }

  async claim(id: string): Promise<Notification | undefined> {
    return this.db.transaction(async (manager) => {
      const [row]: Notification[] = await manager.query(
        `SELECT * FROM email_notifications
        WHERE id=$1 AND status IN ('pending','retry_wait') AND next_attempt_at<=now() AND expires_at>now()
        `,
        [id],
      );
      if (!row) return;
      // Old pending jobs must not be silently routed through a different configured sender.
      if (row.provider_account !== this.config.get<string>('MAIL_USER')) {
        await manager.query(
          `UPDATE email_notifications SET status='blocked',last_error_category='sender_changed',updated_at=now() WHERE id=$1 AND status IN ('pending','retry_wait')`,
          [id],
        );
        this.event(
          'mail_review_required',
          { notification_id: id, category: 'sender_changed' },
          true,
        );
        return;
      }
      await manager.query(
        `INSERT INTO email_provider_state(account) VALUES($1) ON CONFLICT DO NOTHING`,
        [row.provider_account],
      );
      const lease = randomUUID();
      const [permission] = await manager.query(
        `WITH changed AS (UPDATE email_provider_state SET
        active_lease=$2,active_until=now()+interval '3 minutes',next_send_at=now()+interval '3 seconds',updated_at=now()
        WHERE account=$1 AND NOT paused AND next_send_at<=now() AND (active_until IS NULL OR active_until<now()) RETURNING account) SELECT * FROM changed`,
        [row.provider_account, lease],
      );
      if (!permission) return;
      const [claimed] = await manager.query(
        `WITH changed AS (UPDATE email_notifications SET status='sending',lease_token=$2,
        locked_until=now()+interval '3 minutes',attempt_count=attempt_count+1,updated_at=now() WHERE id=$1 AND status IN ('pending','retry_wait') AND next_attempt_at<=now() AND expires_at>now() RETURNING *) SELECT * FROM changed`,
        [id, lease],
      );
      if (!claimed) {
        await manager.query(
          `UPDATE email_provider_state SET active_lease=NULL,active_until=NULL WHERE account=$1 AND active_lease=$2`,
          [row.provider_account, lease],
        );
        return;
      }
      await manager.query(
        `INSERT INTO email_attempts(notification_id,attempt,result) VALUES($1,$2,'sending')`,
        [id, claimed.attempt_count],
      );
      return claimed;
    });
  }

  private async finish(
    row: Notification,
    status: string,
    category?: string,
    smtpCode?: number,
    messageId?: string,
  ) {
    await this.db.transaction(async (manager) => {
      // Use the same lock order as claim: provider first, notification second.
      await manager.query(
        'SELECT account FROM email_provider_state WHERE account=$1 FOR UPDATE',
        [row.provider_account],
      );
      const changed: { id: string }[] = await manager.query(
        `WITH changed AS (UPDATE email_notifications SET status=$3,
        last_error_category=$4,provider_message_id=$5,next_attempt_at=$6,lease_token=NULL,locked_until=NULL,updated_at=now(),
        payload=CASE WHEN $3 IN ('accepted','expired','cancelled') THEN NULL ELSE payload END
        WHERE id=$1 AND lease_token=$2 AND status='sending' RETURNING id) SELECT * FROM changed`,
        [
          row.id,
          row.lease_token,
          status,
          category ?? null,
          messageId ?? null,
          new Date(Date.now() + retryDelay(row.attempt_count)),
        ],
      );
      if (!changed.length)
        throw new Error('Mail lease no longer belongs to this worker');
      await manager.query(
        `UPDATE email_attempts SET result=$3,category=$4,smtp_code=$5
        WHERE notification_id=$1 AND attempt=$2`,
        [row.id, row.attempt_count, status, category ?? null, smtpCode ?? null],
      );
      await manager.query(
        `UPDATE email_provider_state SET active_lease=NULL,active_until=NULL,updated_at=now()
        WHERE account=$1 AND active_lease=$2`,
        [row.provider_account, row.lease_token],
      );
      if (status === 'blocked') {
        const paused = await manager.query(
          `WITH changed AS (UPDATE email_provider_state SET paused=true,reason=$2,updated_at=now()
          WHERE account=$1 AND NOT paused RETURNING account) SELECT * FROM changed`,
          [row.provider_account, category],
        );
        await manager.query(
          `UPDATE email_notifications SET status='blocked',last_error_category=$2,updated_at=now()
          WHERE provider_account=$1 AND status IN ('pending','retry_wait')`,
          [row.provider_account, category],
        );
        if (paused.length)
          this.event(
            'mail_account_blocked',
            { category, account: row.provider_account },
            true,
          );
      }
    });
    this.event(
      status === 'dead' || status === 'uncertain'
        ? 'mail_review_required'
        : 'mail_attempt',
      {
        notification_id: row.id,
        event_id: row.event_id,
        result: status,
        attempt: row.attempt_count,
        category,
      },
      status === 'dead' || status === 'uncertain',
    );
  }

  async process(id: string): Promise<void> {
    const row = await this.claim(id);
    if (!row) return;
    let options: ISendMailOptions;
    try {
      options = unseal<ISendMailOptions>(
        row.payload,
        encryptionKey(this.config.get<string>('MAIL_OUTBOX_KEY')),
      );
      if (row.type === 'reset') {
        const user =
          row.user_id &&
          (await this.db.getRepository(User).findOne({
            where: { id: row.user_id, isActive: true },
            select: { id: true, password: true, email: true },
          }));
        const headers = options.headers as Record<string, string>;
        const token = headers?.['X-Comportarte-Reset-Token'];
        if (
          !user ||
          (user.email.trim().toLowerCase() !==
            String(options.to).toLowerCase() &&
            this.config.get('NODE_ENV') !== 'development')
        ) {
          await this.finish(row, 'cancelled', 'reset_user_changed');
          return;
        }
        try {
          new JwtService(this.config).verifyResetToken(token, user.password);
        } catch {
          await this.finish(row, 'expired', 'reset_token_expired');
          return;
        }
        if (String(options.html).includes(RESET_TOKEN_PLACEHOLDER)) {
          // Mint once when the request reaches SMTP, then persist that exact token for retries.
          const issued = new JwtService(this.config).createResetToken(
            row.user_id,
            user.password,
          );
          options.html = String(options.html)
            .split(RESET_TOKEN_PLACEHOLDER)
            .join(issued);
          headers['X-Comportarte-Reset-Token'] = issued;
          const saved = await this.db.query(
            `WITH changed AS (UPDATE email_notifications
            SET payload=$3,expires_at=now()+interval '4 minutes',updated_at=now()
            WHERE id=$1 AND lease_token=$2 AND status='sending' RETURNING id) SELECT * FROM changed`,
            [
              row.id,
              row.lease_token,
              seal(
                options,
                encryptionKey(this.config.get<string>('MAIL_OUTBOX_KEY')),
              ),
            ],
          );
          if (!saved.length)
            throw new Error('Reset mail lease lost before submission');
          row.expires_at = new Date(Date.now() + 240_000);
        }
        delete options.headers;
      }
    } catch {
      await this.finish(row, 'dead', 'payload_invalid');
      return;
    }
    // Refresh both DB leases while SMTP is active. A lost lease is never automatically resent.
    const timer = setInterval(() => {
      void this.db
        .transaction(async (manager) => {
          await manager.query(
            `UPDATE email_provider_state SET active_until=now()+interval '3 minutes' WHERE account=$1 AND active_lease=$2`,
            [row.provider_account, row.lease_token],
          );
          await manager.query(
            `UPDATE email_notifications SET locked_until=now()+interval '3 minutes' WHERE id=$1 AND lease_token=$2 AND status='sending'`,
            [row.id, row.lease_token],
          );
        })
        .catch(() =>
          this.event(
            'mail_lease_refresh_failed',
            { notification_id: row.id },
            true,
          ),
        );
    }, 30_000);
    try {
      let info: { messageId?: string; accepted?: unknown[] };
      try {
        info = await this.mailer.sendMail(options);
      } catch (error) {
        const policy = classifyMailError(error);
        let status: string = policy.status;
        if (
          status === 'retry_wait' &&
          (row.attempt_count >= row.max_attempts ||
            new Date(row.expires_at).getTime() <= Date.now())
        )
          status = 'dead';
        await this.finish(
          row,
          status,
          policy.category,
          (error as { responseCode?: number }).responseCode,
        );
        return;
      }
      // Do not classify a DB failure here as SMTP rejection: acceptance may already have happened.
      if (!info?.accepted?.length) {
        await this.finish(row, 'uncertain', 'acceptance_not_confirmed');
        return;
      }
      await this.finish(row, 'accepted', undefined, undefined, info.messageId);
    } finally {
      clearInterval(timer);
    }
  }

  async metrics() {
    await this.db
      .query(`INSERT INTO email_worker_heartbeat(name) VALUES('mail-worker')
      ON CONFLICT(name) DO UPDATE SET updated_at=now()`);
    const [metrics] = await this.db.query(`SELECT
      count(*) FILTER (WHERE status IN ('pending','retry_wait'))::int AS pending,
      count(*) FILTER (WHERE status='blocked')::int AS blocked,
      count(*) FILTER (WHERE status IN ('dead','uncertain'))::int AS review,
      coalesce(extract(epoch FROM now()-min(n.created_at) FILTER (WHERE status IN ('pending','retry_wait') AND next_attempt_at<=now() AND NOT coalesce(p.paused,false))),0)::int AS oldest_seconds
      FROM email_notifications n LEFT JOIN email_provider_state p ON p.account=n.provider_account`);
    this.event('mail_heartbeat', metrics);
    if (metrics.pending && metrics.oldest_seconds > 300)
      this.event('mail_backlog', metrics, true);
  }
}
