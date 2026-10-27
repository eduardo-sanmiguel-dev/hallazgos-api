import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { IdempotencyKey } from './entities/idempotency-key.entity.js';

/** Un envío que sigue en `processing` después de esto ya no va a terminar. */
const STALE_AFTER = '5 minutes';
const RETENTION = '7 days';

export type ClaimResult =
  | { kind: 'new' }
  | { kind: 'done'; response: unknown }
  | { kind: 'processing' }
  // El envío anterior falló con un error del servidor o se quedó a medias:
  // no se sabe si alcanzó a guardar.
  | { kind: 'unconfirmed' }
  | { kind: 'mismatch' };

interface StoredRow {
  route: string;
  status: string;
  response: unknown;
  stale: boolean;
}

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly repository: Repository<IdempotencyKey>,
  ) {}

  /**
   * Registra la clave como `processing` si es nueva (en una sola sentencia:
   * dos peticiones simultáneas no pueden ganar ambas) o dice en qué quedó el
   * envío anterior con esa clave.
   */
  async claim(
    userId: number,
    key: string,
    route: string,
  ): Promise<ClaimResult> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const inserted: unknown[] = await this.repository.query(
        `INSERT INTO "idempotency_key" ("user_id", "key", "route")
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING
         RETURNING "key"`,
        [userId, key, route],
      );
      if (inserted.length) return { kind: 'new' };

      const [row]: StoredRow[] = await this.repository.query(
        `SELECT "route", "status", "response",
                now() - "created_at" > interval '${STALE_AFTER}' AS "stale"
           FROM "idempotency_key"
          WHERE "user_id" = $1 AND "key" = $2`,
        [userId, key],
      );
      // Se liberó entre el INSERT y el SELECT (el envío anterior falló con
      // un error de datos): se vuelve a intentar registrarla.
      if (!row) continue;

      if (row.route !== route) return { kind: 'mismatch' };
      if (row.status === 'done')
        return { kind: 'done', response: row.response };
      if (row.status === 'failed' || row.stale) return { kind: 'unconfirmed' };
      return { kind: 'processing' };
    }

    return { kind: 'processing' };
  }

  /** El envío terminó bien: se guarda la respuesta para los reintentos. */
  async complete(
    userId: number,
    key: string,
    httpStatus: number,
    response: unknown,
  ) {
    await this.repository.query(
      `UPDATE "idempotency_key"
          SET "status" = 'done', "http_status" = $3, "response" = $4::jsonb
        WHERE "user_id" = $1 AND "key" = $2`,
      [userId, key, httpStatus, JSON.stringify(response ?? null)],
    );
  }

  /**
   * Error de datos o de reglas (4xx): el servicio valida antes de guardar,
   * así que no se guardó nada y el reintento se procesa de nuevo.
   */
  async release(userId: number, key: string) {
    await this.repository.delete({ userId, key, status: 'processing' });
  }

  /**
   * Error del servidor (5xx): pudo fallar después de guardar. La clave se
   * conserva para que el reintento no duplique; responde "sin confirmar".
   */
  async markFailed(userId: number, key: string) {
    await this.repository.update(
      { userId, key, status: 'processing' },
      { status: 'failed' },
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpired() {
    try {
      await this.repository.query(
        `DELETE FROM "idempotency_key" WHERE "created_at" < now() - interval '${RETENTION}'`,
      );
    } catch (error) {
      this.logger.error(
        `No se pudieron borrar las claves de idempotencia vencidas: ${(error as Error)?.message ?? error}`,
      );
    }
  }
}
