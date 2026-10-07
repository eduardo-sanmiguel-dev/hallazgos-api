import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterExtinguisherEvaluationNumberToVarchar1790714000000 implements MigrationInterface {
  name = 'AlterExtinguisherEvaluationNumberToVarchar1790714000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "extinguisher_inspection_evaluations"
      ALTER COLUMN "extinguisherNumber" TYPE character varying(50)
      USING "extinguisherNumber"::character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "extinguisher_inspection_evaluations"
      ALTER COLUMN "extinguisherNumber" TYPE integer
      USING "extinguisherNumber"::integer
    `);
  }
}
