/**
 * E2E (app completa + base de pruebas): clave de idempotencia en los envíos
 * con foto o con correo. Un reintento con la misma clave no duplica el
 * registro ni los correos.
 */
import { randomUUID } from 'crypto';
import { request as httpRequest } from 'http';
import type { AddressInfo } from 'net';
import { readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

import { Comment } from '../../src/evidences/entities/comments.entity.js';
import { Evidence } from '../../src/evidences/entities/evidence.entity.js';
import { IdempotencyKey } from '../../src/idempotency/entities/idempotency-key.entity.js';
import { APP_KEY, API, createE2eApp, type E2eApp } from './e2e-app.js';
import { saveEvidence, STATUSES } from './fixtures.js';

// JPG de ~1.5 MB: firma JPEG y relleno (el API valida la firma y el tamaño).
const BIG_JPG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(1_500_000, 7),
]);
const IMAGES_DIR = join(
  __dirname,
  '..',
  '..',
  'public',
  'static',
  'images',
  'evidences',
);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Espera a que terminen los correos en segundo plano (el conteo se estabiliza). */
const settledCalls = async (mock: jest.Mock) => {
  let previous = -1;
  while (previous !== mock.mock.calls.length) {
    previous = mock.mock.calls.length;
    await sleep(150);
  }
  return previous;
};

describe('E2E: idempotencia de envíos', () => {
  let e2e: E2eApp;
  const startedAt = Date.now();

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  afterAll(async () => {
    // Borra las fotos de prueba que quedaron en disco.
    for (const name of readdirSync(IMAGES_DIR)) {
      const { size, mtimeMs } = statSync(join(IMAGES_DIR, name));
      if (size === BIG_JPG.length && mtimeMs >= startedAt) {
        unlinkSync(join(IMAGES_DIR, name));
      }
    }
    await e2e?.close();
  });

  const fields = () => ({
    manufacturingPlantId: String(e2e.base.plants.tepotzotlan.id),
    type: String(e2e.base.secondaryType.id),
    typeHallazgo: String(e2e.base.mainType.id),
    zone: String(e2e.base.zone.id),
    process: String(e2e.base.process.id),
    description: `Idempotencia ${randomUUID()}`,
  });

  const createEvidence = (
    key: string,
    body = fields(),
    token = e2e.tokens.general,
  ) =>
    e2e
      .call('post', '/evidences', token)
      .set('Idempotency-Key', key)
      .field(body)
      .attach('file', BIG_JPG, 'evidencia.jpg');

  const countByDescription = (description: string) =>
    e2e.dataSource.getRepository(Evidence).countBy({ description });

  const storedKey = (key: string) =>
    e2e.dataSource.getRepository(IdempotencyKey).findOneBy({ key });

  it('reintento con clave terminada: misma respuesta, un solo hallazgo y sin correos de más', async () => {
    const key = randomUUID();
    const body = fields();

    const first = await createEvidence(key, body).expect(201);
    const emails = await settledCalls(e2e.mail.sendCreate);
    expect(emails).toBeGreaterThan(0);

    const retry = await createEvidence(key, body).expect(201);

    expect(retry.text).toBe(first.text);
    // El id del hallazgo, y el aviso de que ya se había guardado solo en el
    // reintento (la UI muestra "Ya se había guardado (hallazgo #N)").
    expect(retry.body).toEqual({ id: expect.any(Number) });
    expect(first.headers['idempotent-replayed']).toBeUndefined();
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(await countByDescription(body.description)).toBe(1);
    expect(await settledCalls(e2e.mail.sendCreate)).toBe(emails);
    expect(await storedKey(key)).toMatchObject({
      status: 'done',
      httpStatus: 201,
      route: `POST ${API}/evidences`,
    });
  });

  it('reintento de cerrar: devuelve el hallazgo cerrado en lugar de un 409 y no reenvía correos', async () => {
    const { id } = await saveEvidence(e2e.dataSource, e2e.base);
    const key = randomUUID();
    const close = () =>
      e2e
        .call('post', `/evidences/solution/${id}`, e2e.tokens.supervisor)
        .set('Idempotency-Key', key)
        .field({ descriptionSolution: 'Se limpió' })
        .attach('file', BIG_JPG, 'solucion.jpg');

    const first = await close().expect(201);
    const emails = await settledCalls(e2e.mail.sendSolution);
    const retry = await close().expect(201);

    expect(retry.body).toEqual(first.body);
    expect(retry.body.status).toBe(STATUSES.closed);
    expect(await settledCalls(e2e.mail.sendSolution)).toBe(emails);
  });

  it('reintento de comentario: un solo comentario', async () => {
    const { id } = await saveEvidence(e2e.dataSource, e2e.base);
    const key = randomUUID();
    const comment = () =>
      e2e
        .call('post', `/evidences/add/comment/${id}`, e2e.tokens.general)
        .set('Idempotency-Key', key)
        .send({ comment: 'Una sola vez' });

    await comment().expect(201);
    await comment().expect(201);

    expect(
      await e2e.dataSource
        .getRepository(Comment)
        .countBy({ comment: 'Una sola vez', evidence: { id } }),
    ).toBe(1);
  });

  it('clave en proceso: 409 IDEMPOTENCY_IN_PROGRESS sin crear nada', async () => {
    const key = randomUUID();
    const body = fields();
    await e2e.dataSource.getRepository(IdempotencyKey).insert({
      userId: e2e.base.users.general.id,
      key,
      route: `POST ${API}/evidences`,
      status: 'processing',
    });

    const res = await createEvidence(key, body).expect(409);

    expect(res.body).toMatchObject({
      code: 'IDEMPOTENCY_IN_PROGRESS',
      message:
        'Tu envío anterior todavía se está procesando. Espera unos segundos.',
    });
    expect(await countByDescription(body.description)).toBe(0);
  });

  it('clave en proceso hace más de 5 minutos o fallida: 409 IDEMPOTENCY_UNCONFIRMED', async () => {
    const repository = e2e.dataSource.getRepository(IdempotencyKey);
    const stale = randomUUID();
    const failed = randomUUID();
    await repository.insert([
      {
        userId: e2e.base.users.general.id,
        key: stale,
        route: `POST ${API}/evidences`,
        status: 'processing',
        createdAt: new Date(Date.now() - 6 * 60_000),
      },
      {
        userId: e2e.base.users.general.id,
        key: failed,
        route: `POST ${API}/evidences`,
        status: 'failed',
      },
    ]);

    for (const key of [stale, failed]) {
      const res = await createEvidence(key).expect(409);
      expect(res.body.code).toBe('IDEMPOTENCY_UNCONFIRMED');
    }
  });

  it('un error de datos libera la clave: el reintento corregido se procesa', async () => {
    const key = randomUUID();
    const { zone: _zone, ...withoutZone } = fields();

    const rejected = await createEvidence(key, withoutZone as never).expect(
      400,
    );
    expect(rejected.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: { zone: 'Dato obligatorio.' },
    });
    expect(await storedKey(key)).toBeNull();

    const body = fields();
    await createEvidence(key, body).expect(201);
    expect(await countByDescription(body.description)).toBe(1);
  });

  it('la clave de otro usuario no devuelve su respuesta: cada uno tiene la suya', async () => {
    const key = randomUUID();
    const mine = fields();
    const theirs = fields();

    await createEvidence(key, mine, e2e.tokens.general).expect(201);
    await createEvidence(key, theirs, e2e.tokens.supervisor).expect(201);

    expect(await countByDescription(mine.description)).toBe(1);
    expect(await countByDescription(theirs.description)).toBe(1);
  });

  it('la misma clave en otra ruta responde 422 y no ejecuta la operación', async () => {
    const { id } = await saveEvidence(e2e.dataSource, e2e.base);
    const key = randomUUID();
    await createEvidence(key).expect(201);

    const res = await e2e
      .call('post', `/evidences/add/comment/${id}`, e2e.tokens.general)
      .set('Idempotency-Key', key)
      .send({ comment: 'No debe guardarse' })
      .expect(422);

    expect(res.body.code).toBe('IDEMPOTENCY_KEY_MISMATCH');
    expect(
      await e2e.dataSource
        .getRepository(Comment)
        .countBy({ comment: 'No debe guardarse' }),
    ).toBe(0);
  });

  it('sin header todo funciona como antes (UI anterior)', async () => {
    const body = fields();
    await e2e
      .call('post', '/evidences', e2e.tokens.general)
      .field(body)
      .attach('file', BIG_JPG, 'evidencia.jpg')
      .expect(201);
    expect(await countByDescription(body.description)).toBe(1);
  });

  it('reintento resuelto con la foto subiendo lento: la respuesta llega completa, sin cortar la conexión', async () => {
    const key = randomUUID();
    const body = fields();
    await createEvidence(key, body).expect(201);

    // Multipart a mano, enviado en pedazos de 64 KB con pausas: el API ya
    // tiene la respuesta, pero debe esperar a que termine la subida.
    const boundary = `----idem${Date.now()}`;
    const parts = Object.entries(body).map(
      ([name, value]) =>
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    );
    const payload = Buffer.concat([
      Buffer.from(parts.join('')),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="evidencia.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      BIG_JPG,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const { port } = e2e.server.address() as AddressInfo;

    const result = await new Promise<{ status?: number; text: string }>(
      (resolve, reject) => {
        const req = httpRequest(
          {
            host: '127.0.0.1',
            port,
            method: 'POST',
            path: `${API}/evidences`,
            headers: {
              'Content-Type': `multipart/form-data; boundary=${boundary}`,
              'Content-Length': payload.length,
              'Idempotency-Key': key,
              'x-app-key': APP_KEY(),
              Authorization: `Bearer ${e2e.tokens.general}`,
            },
          },
          (res) => {
            let text = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => (text += chunk));
            res.on('end', () => resolve({ status: res.statusCode, text }));
          },
        );
        req.on('error', reject);

        const CHUNK = 64 * 1024;
        let offset = 0;
        const writeNext = () => {
          if (offset >= payload.length) return req.end();
          req.write(payload.subarray(offset, offset + CHUNK));
          offset += CHUNK;
          setTimeout(writeNext, 10);
        };
        writeNext();
      },
    );

    expect(result.status).toBe(201);
    expect(JSON.parse(result.text)).toHaveProperty('id');
    expect(await countByDescription(body.description)).toBe(1);
  });
});
