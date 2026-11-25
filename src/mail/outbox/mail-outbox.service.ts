import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, type EntityManager } from 'typeorm';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import type { ISendMailOptions } from '@nestjs-modules/mailer';
import { traced } from '../../shared/tracing/traced.js';
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
  // Correos por guardar, uno por contenido distinto (clave: hash del correo
  // sin destinatario). Se insertan todos juntos al terminar la captura,
  // dentro de la misma transacción.
  messages: Map<string, PendingMail>;
};

type PendingMail = {
  mail: ISendMailOptions;
  recipients: string[];
  type: string;
  evidenceId: number | null;
};

/** Id del hallazgo del asunto "Hallazgo #N · …" (null en los demás correos). */
const evidenceIdOf = (subject: unknown) => {
  const match = /Hallazgo #(\d+)/.exec(String(subject));
  return match ? Number(match[1]) : null;
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
      messages: new Map(),
    };
    return this.context.run(ctx, async () => {
      const result = await work();
      await this.insertRows(ctx);
      return result;
    });
  }

  /**
   * Un INSERT para todos los correos del evento. Un error aquí aborta la
   * transacción del llamador, igual que antes. `recipient` guarda la lista
   * de destinatarios del correo (uno o varios, separados por coma).
   */
  private async insertRows(ctx: Capture) {
    const { manager, messages } = ctx;
    const key = encryptionKey(this.config.get<string>('MAIL_OUTBOX_KEY'));
    const rows = [...messages.values()].map(
      ({ mail, recipients, type, evidenceId }) => {
        const id = randomUUID();
        return [
          id,
          ctx.event,
          recipients.join(', '),
          this.config.get<string>('MAIL_USER'),
          type,
          evidenceId,
          ctx.userId ?? null,
          seal(
            {
              ...addressed(mail, recipients),
              messageId: `<${id}@comportarte.com>`,
            },
            key,
          ),
          ctx.expires,
          type === 'reset' ? 1 : 10,
        ];
      },
    );
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
    // Coordinate immutable blob creation with the daily garbage collector.
    // Es un lock de transacción: el primer destinatario lo toma y se libera
    // en el commit/rollback; repetirlo por cada uno solo sumaba consultas.
    ctx.blobLock ??= ctx.manager.query(
      'SELECT pg_advisory_xact_lock_shared(722, 1)',
    );
    await ctx.blobLock;
    // Render (una vez por evento) y adjuntos congelados: trabajo dentro de
    // Node que no se ve como SQL en la traza.
    const frozen = await traced(
      'mail.freeze',
      { 'mail.template': String(options.template) },
      () =>
        freezeMail(
          options,
          this.config.get<string>('MAIL_OUTBOX_DIR') || 'var/mail-outbox/blobs',
          ctx.attachments,
          ctx.rendered,
        ),
    );
    // Mismo contenido (todo menos el destinatario) = mismo correo: un mensaje
    // por aviso con todos sus destinatarios, en vez de una copia por persona
    // (hasta 48 al crear un hallazgo, y cada una ocupaba "Enviados" del buzón
    // remitente). Se guarda al terminar la captura (insertRows).
    const content = createHash('sha256')
      .update(JSON.stringify({ ...frozen, to: undefined }))
      .digest('hex');
    const message = ctx.messages.get(content);
    if (message) {
      message.recipients.push(recipient);
      return;
    }
    ctx.messages.set(content, {
      mail: frozen,
      recipients: [recipient],
      type:
        ctx.type === 'reset'
          ? 'reset'
          : String(options.template).replace('./', ''),
      evidenceId: evidenceIdOf(options.subject),
    });
  }
}

/**
 * Un destinatario va en "Para", como siempre. Varios van en copia oculta
 * (sin "Para"): ninguno ve las direcciones de los demás ni puede responder a
 * todos por error.
 */
const addressed = (
  mail: ISendMailOptions,
  recipients: string[],
): ISendMailOptions => {
  if (recipients.length === 1) return { ...mail, to: recipients[0] };
  const { to: _to, ...rest } = mail;
  return { ...rest, bcc: recipients };
};
