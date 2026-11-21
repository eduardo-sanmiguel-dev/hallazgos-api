import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Índices para las consultas de hallazgos más frecuentes en producción
 * (trazas de OpenObserve, noviembre de 2026):
 *
 * - `(manufacturingPlantId, createdAt)`: todas las gráficas del dashboard y
 *   el filtro por fechas del listado filtran por planta y rango de
 *   `createdAt`. Con el índice de solo planta Postgres leía todos los
 *   hallazgos de la planta y descartaba los de otras fechas.
 * - `imgEvidence`, `imgProcess`, `imgSolution`: cada foto que pide la UI
 *   pasa por `evidence-image-access.middleware`, que busca el archivo en las
 *   tres columnas. Sin índice recorría la tabla completa por cada imagen.
 *
 * Solo agrega índices: no modifica ni borra filas ni columnas. La tabla es
 * chica (miles de filas), así que CREATE INDEX normal (dentro de la
 * transacción de migraciones) bloquea escrituras solo unos milisegundos. IF
 * NOT EXISTS la hace segura si se corre dos veces. Los nombres coinciden con
 * los @Index de la entidad Evidence.
 */
const INDEXES: [name: string, columns: string][] = [
  [
    'IDX_evidence_manufacturingPlantId_createdAt',
    '"manufacturingPlantId", "createdAt"',
  ],
  ['IDX_evidence_imgEvidence', '"imgEvidence"'],
  ['IDX_evidence_imgProcess', '"imgProcess"'],
  ['IDX_evidence_imgSolution', '"imgSolution"'],
];

export class AddEvidenceQueryIndexes1794100000000 implements MigrationInterface {
  name = 'AddEvidenceQueryIndexes1794100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [name, columns] of INDEXES) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "${name}" ON "evidence" (${columns})`,
      );
    }
  }

  /** Quita solo los índices que agregó `up`. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [name] of [...INDEXES].reverse()) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${name}"`);
    }
  }
}
