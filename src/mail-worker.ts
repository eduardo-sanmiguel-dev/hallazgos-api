import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { MailWorkerModule } from './mail/outbox/mail-worker.module.js';
import { MailDeliveryService } from './mail/outbox/mail-delivery.service.js';
import { encryptionKey } from './mail/outbox/mail-payload.js';
import { exitOnSignal } from './mail/outbox/graceful-shutdown.js';
import {
  createOpenObserveLogger,
  type ObserveConfig,
} from './shared/services/openobserve-logger.js';

async function main() {
  const app = await NestFactory.createApplicationContext(MailWorkerModule, {
    bufferLogs: true,
  });
  const config = app.get(ConfigService);
  const logger = createOpenObserveLogger({
    environment: config.get('environment'),
    ...config.get<ObserveConfig>('observe'),
  });
  if (logger) app.useLogger(logger);
  else app.flushLogs();
  encryptionKey(config.get('MAIL_OUTBOX_KEY'));
  const url = new URL(
    config.get<string>('MAIL_REDIS_URL') || 'redis://127.0.0.1:6381',
  );
  if (!['redis:', 'rediss:'].includes(url.protocol))
    throw new Error('Invalid MAIL_REDIS_URL');
  const connection = {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: Number(url.pathname.slice(1) || 0),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
  const delivery = app.get(MailDeliveryService);
  const queue = new Queue('comportarte-mail-v1', {
    connection: {
      ...connection,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    },
  });
  const worker = new Worker(
    'comportarte-mail-v1',
    (job) => delivery.process(job.data.id),
    { connection, concurrency: 1, limiter: { max: 1, duration: 3000 } },
  );
  queue.on('error', (error) =>
    delivery.event(
      'mail_queue_unavailable',
      { error_code: (error as NodeJS.ErrnoException).code || error.name },
      true,
    ),
  );
  worker.on('error', (error) =>
    delivery.event(
      'mail_worker_error',
      { error_code: (error as NodeJS.ErrnoException).code || error.name },
      true,
    ),
  );
  worker.on('failed', (job) =>
    delivery.event(
      'mail_job_interrupted',
      { notification_id: job?.data.id },
      true,
    ),
  );
  let polling = false;
  let stopped = false;
  let lastMetrics = 0;
  let wasReady = false;
  async function poll() {
    if (polling || stopped) return;
    polling = true;
    try {
      await queue.getJobCounts('waiting');
      await delivery.reconcile();
      for (const row of await delivery.due())
        await queue.add(
          'send',
          { id: row.id },
          {
            jobId: row.id,
            priority: row.priority,
            removeOnComplete: true,
            removeOnFail: true,
            attempts: 1,
          },
        );
      if (Date.now() - lastMetrics > 30_000) {
        await delivery.metrics();
        lastMetrics = Date.now();
      }
      if (!wasReady) delivery.event('mail_worker_ready');
      wasReady = true;
    } catch (error) {
      wasReady = false;
      delivery.event(
        'mail_dispatcher_unavailable',
        {
          error_code:
            (error as NodeJS.ErrnoException).code || (error as Error).name,
        },
        true,
      );
    } finally {
      polling = false;
    }
  }
  const timer = setInterval(() => void poll(), 5000);
  const heartbeat = setInterval(
    () =>
      void delivery
        .metrics()
        .catch(() => delivery.event('mail_database_unavailable', {}, true)),
    30_000,
  );
  await poll();
  exitOnSignal(async () => {
    stopped = true;
    clearInterval(timer);
    clearInterval(heartbeat);
    await worker.close();
    await queue.close();
    await app.close();
    await logger?.close();
  });
}
main().catch(() => {
  process.stderr.write(
    'Mail worker could not start; check configuration and database\n',
  );
  process.exit(1);
});
