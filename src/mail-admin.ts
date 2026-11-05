import { ConfigService } from '@nestjs/config';
import {
  createOpenObserveLogger,
  type ObserveConfig,
} from './shared/services/openobserve-logger.js';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { MailWorkerModule } from './mail/outbox/mail-worker.module.js';

/** Run on the VPS as its application owner. No public administrative endpoint. */
async function main() {
  const [command, value, acknowledgement] = process.argv.slice(2);
  const app = await NestFactory.createApplicationContext(MailWorkerModule, {
    logger: false,
  });
  const db = app.get(DataSource);
  try {
    if (command === 'health') {
      const [row] = await db.query(
        "SELECT 1 FROM email_worker_heartbeat WHERE name='mail-worker' AND updated_at>now()-interval '90 seconds' AND updated_at>=to_timestamp($1)",
        [Number(value || 0)],
      );
      if (!row) throw new Error('Mail worker heartbeat missing or stale');
      console.log('Mail worker healthy');
    } else if (command === 'report') {
      const config = app.get(ConfigService);
      const logger = createOpenObserveLogger({
        environment: config.get('environment'),
        ...config.get<ObserveConfig>('observe'),
      });
      for (const account of await db.query(
        'SELECT account,reason FROM email_provider_state WHERE paused',
      )) {
        logger?.error(
          {
            component: 'mail-worker',
            event: 'mail_account_blocked',
            account: account.account,
            category: account.reason,
          },
          undefined,
          'MailWorker',
        );
      }
      const [review] = await db.query(
        "SELECT count(*)::int AS count FROM email_notifications WHERE status IN ('dead','uncertain')",
      );
      if (review.count)
        logger?.error(
          {
            component: 'mail-worker',
            event: 'mail_review_required',
            count: review.count,
          },
          undefined,
          'MailWorker',
        );
      logger?.log(
        { component: 'mail-worker', event: 'mail_worker_ready' },
        'MailWorker',
      );
      await logger?.close();
      console.log('Current mail state reported to monitoring');
    } else if (command === 'status') {
      console.log(
        JSON.stringify(
          {
            notifications: await db.query(
              'SELECT status,count(*)::int AS count FROM email_notifications GROUP BY status ORDER BY status',
            ),
            accounts: await db.query(
              'SELECT account,paused,reason,updated_at FROM email_provider_state',
            ),
            heartbeat: await db.query('SELECT * FROM email_worker_heartbeat'),
            review: await db.query(
              `SELECT id,type,evidence_id,status,last_error_category,attempt_count,created_at FROM email_notifications WHERE status IN ('dead','uncertain') ORDER BY created_at DESC LIMIT 50`,
            ),
          },
          null,
          2,
        ),
      );
    } else if (command === 'resume' && value) {
      await db.transaction(async (manager) => {
        await manager.query(
          `UPDATE email_provider_state SET paused=false,reason=NULL,updated_at=now() WHERE account=$1`,
          [value],
        );
        await manager.query(
          `UPDATE email_notifications SET status='pending',next_attempt_at=now(),updated_at=now() WHERE provider_account=$1 AND status='blocked' AND expires_at>now()`,
          [value],
        );
      });
      const config = app.get(ConfigService);
      const logger = createOpenObserveLogger({
        environment: config.get('environment'),
        ...config.get<ObserveConfig>('observe'),
      });
      logger?.log(
        {
          component: 'mail-worker',
          event: 'mail_account_resumed',
          account: value,
        },
        'MailWorker',
      );
      await logger?.close();
      console.log(
        'Account resumed; valid pending mail will be sent. Actor:',
        process.env.USER || process.env.USERNAME,
      );
    } else if (
      (command === 'retry' || command === 'cancel') &&
      /^[0-9a-f-]{36}$/i.test(value || '')
    ) {
      await db.transaction(async (manager) => {
        const changed =
          command === 'retry'
            ? await manager.query(
                `WITH changed AS (UPDATE email_notifications SET status='pending',max_attempts=attempt_count+8,next_attempt_at=now(),updated_at=now()
            WHERE id=$1 AND payload IS NOT NULL AND expires_at>now() AND (status='dead' OR (status='uncertain' AND $2)) RETURNING id) SELECT * FROM changed`,
                [value, acknowledgement === '--acknowledge-duplicate-risk'],
              )
            : await manager.query(
                `WITH changed AS (UPDATE email_notifications SET status='cancelled',payload=NULL,updated_at=now()
            WHERE id=$1 AND status IN ('pending','retry_wait','blocked','dead','uncertain','expired') RETURNING id) SELECT * FROM changed`,
                [value],
              );
        if (!changed.length)
          throw new Error(
            'Not eligible: expired, missing payload, accepted, sending, or uncertain without acknowledgement',
          );
        await manager.query(
          `INSERT INTO email_attempts(notification_id,attempt,result,category) VALUES($1,0,$2,$3)`,
          [
            value,
            'manual_' + command,
            `operator:${process.env.USER || process.env.USERNAME || 'unknown'}`,
          ],
        );
      });
      console.log(
        command === 'retry' ? 'Retry scheduled:' : 'Notification cancelled:',
        value,
      );
    } else
      throw new Error(
        'Usage: mail-admin status | resume <account> | retry <uuid> [--acknowledge-duplicate-risk] | cancel <uuid>',
      );
  } finally {
    await app.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
