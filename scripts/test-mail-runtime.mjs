// End-to-end worker smoke test. Requires isolated PostgreSQL/Redis and pnpm build.
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { Queue } from 'bullmq';
import { CreateMailOutbox1793900000000 } from '../dist/migrations/1793900000000-create-mail-outbox.js';
import { encryptionKey, seal } from '../dist/mail/outbox/mail-payload.js';

const database = process.env.MAIL_TEST_DATABASE;
const pgPort = Number(process.env.MAIL_TEST_PG_PORT);
const redisPort = Number(process.env.MAIL_TEST_REDIS_PORT);
if (!database?.endsWith('_test') || !pgPort || !redisPort)
  throw new Error(
    'Set MAIL_TEST_DATABASE (*_test), MAIL_TEST_PG_PORT, MAIL_TEST_REDIS_PORT to disposable services',
  );
const pg = {
  host: '127.0.0.1',
  port: pgPort,
  user: process.env.MAIL_TEST_PG_USER || 'mail_test',
  password: process.env.MAIL_TEST_PG_PASSWORD || 'mail_test_only',
};
const admin = new Client({ ...pg, database: 'postgres' });
await admin.connect();
if (!/^[a-z_][a-z0-9_]*_test$/.test(database))
  throw new Error('Invalid test database');
if (
  !(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database]))
    .rowCount
)
  await admin.query(`CREATE DATABASE "${database}"`);
await admin.end();
const db = new DataSource({
  type: 'postgres',
  host: pg.host,
  port: pg.port,
  username: pg.user,
  password: pg.password,
  database,
});
await db.initialize();
// Only the explicitly named disposable test database is reset.
await db.query('DROP SCHEMA public CASCADE');
await db.query('CREATE SCHEMA public');
const runner = db.createQueryRunner();
await new CreateMailOutbox1793900000000().up(runner);
await runner.release();
const queue = new Queue('comportarte-mail-v1', {
  connection: { host: '127.0.0.1', port: redisPort },
});
await queue.obliterate({ force: true });
let responses = [451, 250];
let accepted = 0,
  submissions = 0;
let worker;
let runtimeEnv;
const sockets = new Set();
const smtp = createServer((socket) => {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
  socket.on('error', () => {});
  socket.write('220 localhost test SMTP\r\n');
  let buffer = '',
    data = false;
  socket.on('data', (chunk) => {
    buffer += chunk.toString();
    let end;
    while ((end = buffer.indexOf('\r\n')) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (data) {
        if (line === '.') {
          data = false;
          submissions++;
          const code = responses.shift() || 250;
          if (code === 250) accepted++;
          socket.write(
            code === 554
              ? '554 5.2.2 Mailbox full STOREDRV.Submission.Exception:QuotaExceededException.MapiExceptionStorageOverQuotaLimitExceeded\r\n'
              : `${code} ${code === 250 ? '2.0.0 accepted' : '4.3.0 temporary failure'}\r\n`,
          );
        }
        continue;
      }
      if (/^(EHLO|HELO)/.test(line))
        socket.write('250-localhost\r\n250 AUTH PLAIN\r\n');
      else if (/^AUTH/.test(line)) socket.write('235 2.7.0 authenticated\r\n');
      else if (/^DATA/.test(line)) {
        data = true;
        socket.write('354 End with dot\r\n');
      } else if (/^QUIT/.test(line)) socket.end('221 bye\r\n');
      else socket.write('250 OK\r\n');
    }
  });
});
smtp.listen(0, '127.0.0.1');
await once(smtp, 'listening');
const smtpPort = smtp.address().port;
async function seed(status = 'pending') {
  const id = randomUUID();
  await db.query(
    `INSERT INTO email_notifications(id,event_id,recipient,provider_account,type,payload,expires_at,status,locked_until,attempt_count)
    VALUES($1,$2,'recipient@example.test','sender@example.test','evidence',$3,now()+interval '24 hours',$4,now()-interval '1 minute',$5)`,
    [
      id,
      randomUUID(),
      seal(
        {
          to: 'recipient@example.test',
          from: 'sender@example.test',
          subject: 'runtime test',
          html: 'test',
        },
        encryptionKey('runtime-test-only'),
      ),
      status,
      status === 'sending' ? 1 : 0,
    ],
  );
  return id;
}
function start() {
  worker = spawn(process.execPath, ['dist/mail-worker.js'], {
    stdio: ['ignore', 'ignore', 'ignore'],
    env: (runtimeEnv = {
      ...process.env,
      NODE_ENV: 'test',
      DB_HOST: pg.host,
      DB_PORT: String(pg.port),
      DB_USERNAME: pg.user,
      DB_PASSWORD: pg.password,
      DB_NAME: database,
      MAIL_USER: 'sender@example.test',
      MAIL_PASSWORD: 'test-only',
      MAIL_HOST: '127.0.0.1',
      MAIL_PORT: String(smtpPort),
      MAIL_OUTBOX_KEY: 'runtime-test-only',
      MAIL_REDIS_URL: `redis://127.0.0.1:${redisPort}`,
      JWT_SECRET_KEY: 'test-only',
    }),
  });
}
async function cli(...args) {
  return promisify(execFile)(
    process.execPath,
    ['dist/mail-admin.js', ...args],
    { env: runtimeEnv },
  );
}
// Capture the real CLI's structured logs without contacting production OpenObserve.
async function checkReport(expectBlocked) {
  const entries = [];
  const observe = createHttpServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    entries.push(...JSON.parse(body));
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{}');
  });
  await new Promise((resolve) => observe.listen(0, '127.0.0.1', resolve));
  try {
    await promisify(execFile)(
      process.execPath,
      ['dist/mail-admin.js', 'report'],
      {
        env: {
          ...runtimeEnv,
          NODE_ENV: 'production',
          OBSERVE_ENDPOINT: `http://127.0.0.1:${observe.address().port}/api/default`,
          OBSERVE_AUTH_HEADER: 'Basic runtime-test-only',
          OBSERVE_STREAM: 'mail_runtime_test',
        },
      },
    );
    const events = entries.map((entry) => entry.event);
    if (
      events.filter((event) => event === 'mail_state_reported').length !== 1 ||
      events.includes('mail_worker_ready')
    )
      throw new Error(
        'Administrative report must not emit a worker-ready notification',
      );
    if (events.includes('mail_account_blocked') !== expectBlocked)
      throw new Error(
        'Administrative report must preserve the blocked-account alert',
      );
    console.log(
      'PASS: state report is distinct from worker readiness; blocked-account alerts preserved',
    );
  } finally {
    await new Promise((resolve) => observe.close(resolve));
  }
}
async function stop() {
  if (worker && worker.exitCode === null) {
    const exited = once(worker, 'exit');
    worker.kill('SIGTERM');
    await exited;
  }
  worker = undefined;
}
async function waitFor(check, label) {
  const until = Date.now() + 45000;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timeout: ${label}`);
}
const state = async (id) =>
  (
    await db.query('SELECT status FROM email_notifications WHERE id=$1', [id])
  )[0]?.status;
try {
  const first = await seed();
  start();
  await waitFor(
    async () => (await state(first)) === 'retry_wait',
    'temporary SMTP rejection',
  );
  await db.query(
    'UPDATE email_notifications SET next_attempt_at=now() WHERE id=$1',
    [first],
  );
  await db.query('UPDATE email_provider_state SET next_send_at=now()');
  await waitFor(
    async () => (await state(first)) === 'accepted',
    'SMTP retry acceptance',
  );
  await stop();
  if (accepted !== 1 || submissions !== 2)
    throw new Error('Unexpected delivery counts');
  await cli('health');
  await cli('status');
  console.log('PASS: real SMTP temporary rejection and delayed retry');
  const second = await seed();
  await queue.add('send', { id: second }, { jobId: second });
  await queue.obliterate({ force: true });
  const interrupted = await seed('sending');
  start();
  await waitFor(
    async () => (await state(second)) === 'accepted',
    'rebuild lost Redis job',
  );
  await waitFor(
    async () => (await state(interrupted)) === 'uncertain',
    'interrupted SMTP review',
  );
  await stop();
  if (accepted !== 2) throw new Error('Unexpected duplicate after restart');
  console.log(
    'PASS: worker restart, reconstruction after Redis job loss, interrupted send held for review',
  );
  let rejected = false;
  try {
    await cli('retry', interrupted);
  } catch {
    rejected = true;
  }
  if (!rejected)
    throw new Error('Uncertain retry did not require acknowledgement');
  await cli('retry', interrupted, '--acknowledge-duplicate-risk');
  await cli('cancel', interrupted);
  if ((await state(interrupted)) !== 'cancelled')
    throw new Error('Manual cancellation failed');
  responses = [554];
  const blocked = await seed();
  const other = await seed();
  start();
  await waitFor(
    async () =>
      (await state(blocked)) === 'blocked' &&
      (await state(other)) === 'blocked',
    'sender circuit breaker',
  );
  await stop();
  if (submissions !== 4) throw new Error('Blocked sender sent extra mail');
  console.log('PASS: sender quota pauses all remaining notifications');
  await checkReport(true);
  await cli('resume', 'sender@example.test');
  start();
  await waitFor(
    async () =>
      (await state(blocked)) === 'accepted' &&
      (await state(other)) === 'accepted',
    'manual account recovery',
  );
  await stop();
  await checkReport(false);
  if (accepted !== 4 || submissions !== 6)
    throw new Error('Unexpected delivery count after account recovery');
  console.log(
    'PASS: administrative health, review, explicit retry, cancellation and account recovery',
  );
} finally {
  await stop();
  for (const socket of sockets) socket.destroy();
  await new Promise((resolve) => smtp.close(resolve));
  await queue.obliterate({ force: true });
  await queue.close();
  await db.destroy();
}
