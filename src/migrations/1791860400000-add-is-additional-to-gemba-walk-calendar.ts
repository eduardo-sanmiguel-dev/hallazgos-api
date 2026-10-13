import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsAdditionalToGembaWalkCalendar1791860400000 implements MigrationInterface {
  name = 'AddIsAdditionalToGembaWalkCalendar1791860400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "gemba_walk_calendar"
      ADD "isAdditional" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "gemba_walk_calendar"
      DROP COLUMN "isAdditional"
    `);
  }
}
