import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateGembaWalks1791871200000 implements MigrationInterface {
  name = 'CreateGembaWalks1791871200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "gemba_walks" (
        "id" SERIAL NOT NULL,
        "performedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "createdById" integer,
        "updatedById" integer,
        "gembaWalkCalendarId" integer,
        CONSTRAINT "PK_gemba_walks_id" PRIMARY KEY ("id")
      )
    `);

    // Un evento programado solo admite un recorrido.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_gemba_walks_gembaWalkCalendarId"
      ON "gemba_walks" ("gembaWalkCalendarId")
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walks"
      ADD CONSTRAINT "FK_gemba_walks_createdById"
      FOREIGN KEY ("createdById") REFERENCES "user"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walks"
      ADD CONSTRAINT "FK_gemba_walks_updatedById"
      FOREIGN KEY ("updatedById") REFERENCES "user"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walks"
      ADD CONSTRAINT "FK_gemba_walks_gembaWalkCalendarId"
      FOREIGN KEY ("gembaWalkCalendarId") REFERENCES "gemba_walk_calendar"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "gemba_walk_results" (
        "id" SERIAL NOT NULL,
        "area" character varying NOT NULL,
        "category" character varying(30) NOT NULL,
        "description" text NOT NULL,
        "isCompliant" boolean NOT NULL,
        "comments" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "gembaWalkId" integer,
        "gembaWalkEvaluationId" integer,
        CONSTRAINT "PK_gemba_walk_results_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walk_results"
      ADD CONSTRAINT "FK_gemba_walk_results_gembaWalkId"
      FOREIGN KEY ("gembaWalkId") REFERENCES "gemba_walks"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walk_results"
      ADD CONSTRAINT "FK_gemba_walk_results_gembaWalkEvaluationId"
      FOREIGN KEY ("gembaWalkEvaluationId") REFERENCES "gemba_walk_evaluations"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "gemba_walk_results"`);
    await queryRunner.query(`DROP TABLE "gemba_walks"`);
  }
}
