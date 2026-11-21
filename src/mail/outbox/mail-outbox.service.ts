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
  // Adjuntos ya congelados en este evento (los comparten sus destinatarios).
  attachments: Map<string, Promise<string>>;
  // HTML ya renderizado en este evento, por plantilla + contexto.
  rendered: Map<string, Promise<string>>;
  // Lock compartido contra el recolector de blobs: dura hasta el fin de la
  // transacción, así que basta pedirlo una vez por evento.
  blobLock?: Promise<unknown>;
  // Parámetros de cada fila por guardar: se insertan todas juntas al terminar
  // la captura, dentro de la misma transacción.
  rows: unknown[][];
};

const PARAMS_PER_ROW = 10;
// 500 × 10 parámetros: lejos del límite de Postgres (65 535 por consulta).
const ROWS_PER_INSERT = 500;

/** `($1,...,$10, status)` de la fila `row` dentro del INSERT. */
const valuesOf = (row: number) => {
  const param = (column: number) => `$${row * PARAMS_PER_ROW + column}`;
  const params = Array.from({ length: PARAMS_PER_ROW }, (_, i) => param(i + 1));
  return `(${params.join(',')},
        CASE WHEN coalesce((SELECT paused FROM email_provider_state WHERE account=${param(4)}),false) THEN 'blocked' ELSE 'pending' END)`;
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
    const ctx: Capture = {
      manager,
      event: randomUUID(),
      type,
      userId,
      expires,
      recipients: new Set(),
      attachments: new Map(),
      rendered: new Map(),
      rows: [],
    };
    return this.context.run(ctx, async () => {
      const result = await work();
      await this.insertRows(ctx);
      return result;
    });
  }

  /**
   * Un INSERT para todos los destinatarios del evento: antes era uno por
   * destinatario (hasta 48 al crear un hallazgo). Un error aquí aborta la
   * transacción del llamador, igual que antes.
   */
  private async insertRows({ manager, rows }: Capture) {
    for (let start = 0; start < rows.length; start += ROWS_PER_INSERT) {
      const chunk = rows.slice(start, start + ROWS_PER_INSERT);
      await manager.query(
        `INSERT INTO email_notifications
      (id,event_id,recipient,provider_account,type,evidence_id,user_id,payload,expires_at,priority,status)
      VALUES ${chunk.map((_, row) => valuesOf(row)).join(',\n      ')}
      ON CONFLICT (event_id,recipient) DO NOTHING`,
        chunk.flat(),
      );
    }
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
    // Es un lock de transacción: el primer destinatario lo toma y se libera
    // en el commit/rollback; repetirlo por cada uno solo sumaba consultas.
    ctx.blobLock ??= ctx.manager.query(
      'SELECT pg_advisory_xact_lock_shared(722, 1)',
    );
    await ctx.blobLock;
    const frozen = await freezeMail(
      options,
      this.config.get<string>('MAIL_OUTBOX_DIR') || 'var/mail-outbox/blobs',
      ctx.attachments,
      ctx.rendered,
    );
    frozen.messageId = `<${id}@comportarte.com>`;
    // Se guarda al terminar la captura (insertRows), junto con los demás.
    ctx.rows.push([
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
    ]);
  }
}
