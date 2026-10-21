import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateGembaWalkEvaluations1791867600000 implements MigrationInterface {
  name = 'CreateGembaWalkEvaluations1791867600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "gemba_walk_evaluations" (
        "id" SERIAL NOT NULL,
        "area" character varying NOT NULL,
        "category" character varying(30) NOT NULL,
        "description" text NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "createdById" integer,
        "updatedById" integer,
        "manufacturingPlantId" integer,
        CONSTRAINT "PK_gemba_walk_evaluations_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walk_evaluations"
      ADD CONSTRAINT "FK_gemba_walk_evaluations_createdById"
      FOREIGN KEY ("createdById") REFERENCES "user"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walk_evaluations"
      ADD CONSTRAINT "FK_gemba_walk_evaluations_updatedById"
      FOREIGN KEY ("updatedById") REFERENCES "user"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walk_evaluations"
      ADD CONSTRAINT "FK_gemba_walk_evaluations_manufacturingPlantId"
      FOREIGN KEY ("manufacturingPlantId") REFERENCES "manufacturing_plant"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "gemba_walk_evaluations"`);
  }
}
