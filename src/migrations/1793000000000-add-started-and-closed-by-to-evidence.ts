import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Quién inició (pasó a "En progreso") y quién cerró cada hallazgo: columnas
 * `startedById` y `closedById` en `evidence`, hacia `user`.
 *
 * Solo agrega: dos columnas que aceptan nulo, su índice y su llave foránea.
 * No modifica ni borra filas. Los hallazgos anteriores quedan en nulo (antes
 * no se registraba quién; no se adivina). Si se borra un usuario, la columna
 * queda en nulo y el hallazgo no se toca (ON DELETE SET NULL). IF NOT EXISTS
 * y el chequeo de la llave la hacen segura si se corre dos veces.
 */
const COLUMNS = [
  ['startedById', 'IDX_evidence_startedById', 'FK_evidence_startedById'],
  ['closedById', 'IDX_evidence_closedById', 'FK_evidence_closedById'],
] as const;

export class AddStartedAndClosedByToEvidence1793000000000 implements MigrationInterface {
  name = 'AddStartedAndClosedByToEvidence1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [column, index, foreignKey] of COLUMNS) {
      await queryRunner.query(
        `ALTER TABLE "evidence" ADD COLUMN IF NOT EXISTS "${column}" integer`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "${index}" ON "evidence" ("${column}")`,
      );
      // Solo en esta tabla "evidence" (la del esquema en uso): el nombre
      // puede existir en otro esquema de la misma base.
      const [{ exists }] = await queryRunner.query(
        `SELECT EXISTS (
          SELECT 1 FROM pg_constraint
           WHERE conname = $1 AND conrelid = '"evidence"'::regclass
        ) AS exists`,
        [foreignKey],
      );
      if (!exists) {
        await queryRunner.query(
          `ALTER TABLE "evidence" ADD CONSTRAINT "${foreignKey}" FOREIGN KEY ("${column}") REFERENCES "user"("id") ON DELETE SET NULL`,
        );
      }
    }
  }

  /** Quita solo lo que agregó `up` (las dos columnas nuevas). */
  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [column, index, foreignKey] of COLUMNS) {
      await queryRunner.query(
        `ALTER TABLE "evidence" DROP CONSTRAINT IF EXISTS "${foreignKey}"`,
      );
      await queryRunner.query(`DROP INDEX IF EXISTS "${index}"`);
      await queryRunner.query(
        `ALTER TABLE "evidence" DROP COLUMN IF EXISTS "${column}"`,
      );
    }
  }
}
