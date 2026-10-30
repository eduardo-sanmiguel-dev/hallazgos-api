import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Quién hizo la última reasignación de responsables de cada hallazgo y
 * cuándo: columnas `reassignedById` (hacia `user`) y `reassignedAt` en
 * `evidence`.
 *
 * Solo agrega: dos columnas que aceptan nulo, el índice y la llave foránea.
 * No modifica ni borra filas. Los hallazgos anteriores quedan en nulo (antes
 * no se registraba quién reasignaba; no se adivina). Si se borra un usuario,
 * la columna queda en nulo y el hallazgo no se toca (ON DELETE SET NULL). IF
 * NOT EXISTS y el chequeo de la llave la hacen segura si se corre dos veces.
 */
export class AddReassignedByToEvidence1793100000000 implements MigrationInterface {
  name = 'AddReassignedByToEvidence1793100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evidence" ADD COLUMN IF NOT EXISTS "reassignedById" integer`,
    );
    // Misma convención que startProcessDate y solutionDate (hora local de la
    // planta, sin zona).
    await queryRunner.query(
      `ALTER TABLE "evidence" ADD COLUMN IF NOT EXISTS "reassignedAt" timestamp`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_evidence_reassignedById" ON "evidence" ("reassignedById")`,
    );
    // Solo en esta tabla "evidence" (la del esquema en uso): el nombre puede
    // existir en otro esquema de la misma base.
    const [{ exists }] = await queryRunner.query(
      `SELECT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'FK_evidence_reassignedById'
           AND conrelid = '"evidence"'::regclass
      ) AS exists`,
    );
    if (!exists) {
      await queryRunner.query(
        `ALTER TABLE "evidence" ADD CONSTRAINT "FK_evidence_reassignedById" FOREIGN KEY ("reassignedById") REFERENCES "user"("id") ON DELETE SET NULL`,
      );
    }
  }

  /** Quita solo lo que agregó `up` (las dos columnas nuevas). */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evidence" DROP CONSTRAINT IF EXISTS "FK_evidence_reassignedById"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_evidence_reassignedById"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evidence" DROP COLUMN IF EXISTS "reassignedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evidence" DROP COLUMN IF EXISTS "reassignedById"`,
    );
  }
}
