import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Elimina el módulo de guías de entrenamiento: sus tablas, registros y el
 * enum de tipos de evaluación. Decisión explícita: se borran sin respaldo.
 *
 * Ninguna tabla que se conserva tiene llaves foráneas hacia estas; el orden
 * va de las dependientes a las independientes. Sin CASCADE: si apareciera
 * una dependencia inesperada, la migración falla y no borra nada (corre en
 * una transacción).
 *
 * Irreversible: down no puede recuperar los datos.
 */
const TABLES = [
  'configs_topic_tg_responsibles',
  'training_guide_evaluation',
  'configs_topic_tg',
  'training_guide',
  'configs_tg',
  'topics_manufacturing_plants',
  'topic',
];

export class DropTrainingGuides1792460000000 implements MigrationInterface {
  name = 'DropTrainingGuides1792460000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."topic_typeofevaluation_enum"`,
    );
  }

  public async down(): Promise<void> {
    throw new Error(
      'DropTrainingGuides es irreversible: las tablas de guías de entrenamiento se eliminaron sin respaldo.',
    );
  }
}
