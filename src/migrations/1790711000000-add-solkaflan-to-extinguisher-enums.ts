import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSolkaflanToExtinguisherEnums1790711000000 implements MigrationInterface {
  name = 'AddSolkaflanToExtinguisherEnums1790711000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_type
          WHERE typname = 'emergency_teams_typeofextinguisher_enum'
        ) THEN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_enum e
            INNER JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'emergency_teams_typeofextinguisher_enum'
              AND e.enumlabel = 'Extintor de Solkaflan'
          ) THEN
            ALTER TYPE "emergency_teams_typeofextinguisher_enum"
            ADD VALUE 'Extintor de Solkaflan';
          END IF;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_type
          WHERE typname = 'extinguisher_inspection_evaluations_typeofextinguisher_enum'
        ) THEN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_enum e
            INNER JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'extinguisher_inspection_evaluations_typeofextinguisher_enum'
              AND e.enumlabel = 'Extintor de Solkaflan'
          ) THEN
            ALTER TYPE "extinguisher_inspection_evaluations_typeofextinguisher_enum"
            ADD VALUE 'Extintor de Solkaflan';
          END IF;
        END IF;
      END
      $$;
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values safely in-place.
  }
}
