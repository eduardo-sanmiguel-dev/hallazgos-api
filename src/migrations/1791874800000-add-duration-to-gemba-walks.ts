import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddDurationToGembaWalks1791874800000 implements MigrationInterface {
  name = 'AddDurationToGembaWalks1791874800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "gemba_walks"
      ADD "startedAt" TIMESTAMP WITH TIME ZONE,
      ADD "durationSeconds" integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "gemba_walks"
      DROP COLUMN "durationSeconds",
      DROP COLUMN "startedAt"
    `);
  }
}
