import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Tabla `idempotency_key`: envíos ya procesados por clave de idempotencia
 * (header Idempotency-Key). Si un envío con foto se reintenta tras un corte de
 * red o un tiempo agotado, el API devuelve la respuesta guardada en lugar de
 * duplicar el hallazgo y sus correos. Tabla aparte: no toca las de negocio.
 * Las filas se borran a los 7 días (IdempotencyService.purgeExpired).
 */
export class CreateIdempotencyKeys1792900000000 implements MigrationInterface {
  name = 'CreateIdempotencyKeys1792900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "idempotency_key" (
        "user_id" integer NOT NULL,
        "key" uuid NOT NULL,
        "route" character varying(160) NOT NULL,
        "status" character varying(12) NOT NULL DEFAULT 'processing',
        "http_status" smallint,
        "response" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_idempotency_key" PRIMARY KEY ("user_id", "key"),
        CONSTRAINT "FK_idempotency_key_user" FOREIGN KEY ("user_id")
          REFERENCES "user"("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_idempotency_key_created_at" ON "idempotency_key" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "idempotency_key"`);
  }
}
