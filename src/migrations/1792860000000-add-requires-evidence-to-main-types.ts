import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Bandera `requires_evidence` en las clasificaciones de hallazgos: si la foto
 * de evidencia es obligatoria al crear y al cerrar. Reemplaza la regla por
 * nombre ("comportamiento inseguro" no exige foto), que se rompía si alguien
 * renombraba la clasificación.
 *
 * Todas quedan en `true` salvo la de comportamiento inseguro. Debe coincidir
 * exactamente una: con cero o varias falla con el detalle en lugar de adivinar
 * (corre en una transacción: no se agrega la columna a medias).
 */
const UNSAFE_BEHAVIOR_PATTERN = '%comportamiento inseguro%';

export class AddRequiresEvidenceToMainTypes1792860000000 implements MigrationInterface {
  name = 'AddRequiresEvidenceToMainTypes1792860000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "main_type" ADD COLUMN IF NOT EXISTS "requires_evidence" boolean NOT NULL DEFAULT true`,
    );

    const matches: { id: number; name: string }[] = await queryRunner.query(
      `SELECT id, name FROM "main_type" WHERE LOWER(name) LIKE $1 ORDER BY id`,
      [UNSAFE_BEHAVIOR_PATTERN],
    );

    if (matches.length !== 1) {
      const found = matches.length
        ? matches.map(({ id, name }) => `#${id} "${name}"`).join(', ')
        : 'ninguna';
      throw new Error(
        `AddRequiresEvidenceToMainTypes: se esperaba exactamente una clasificación cuyo nombre contenga "comportamiento inseguro" y se encontraron ${matches.length} (${found}). Corrige los nombres y vuelve a desplegar.`,
      );
    }

    await queryRunner.query(
      `UPDATE "main_type" SET "requires_evidence" = false WHERE id = $1`,
      [matches[0].id],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "main_type" DROP COLUMN IF EXISTS "requires_evidence"`,
    );
  }
}
