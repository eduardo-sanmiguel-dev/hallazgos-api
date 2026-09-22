import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterEmergencyTeamExtinguisherNumberToVarchar1790119000000 implements MigrationInterface {
  name = 'AlterEmergencyTeamExtinguisherNumberToVarchar1790119000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "emergency_teams"
      ALTER COLUMN "extinguisherNumber" TYPE character varying(50)
      USING "extinguisherNumber"::character varying
    `);

    await queryRunner.query(`
      UPDATE "emergency_teams"
      SET "extinguisherNumber" = CONCAT('SN-', "id")
      WHERE "extinguisherNumber" IS NULL OR "extinguisherNumber" = ''
    `);

    await queryRunner.query(`
      ALTER TABLE "emergency_teams"
      ALTER COLUMN "extinguisherNumber" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "emergency_teams"
      ALTER COLUMN "extinguisherNumber" TYPE integer
      USING "extinguisherNumber"::integer
    `);
  }
}
