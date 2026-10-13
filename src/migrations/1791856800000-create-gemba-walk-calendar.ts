import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGembaWalkCalendar1791856800000 implements MigrationInterface {
  name = 'CreateGembaWalkCalendar1791856800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "gemba_walk_calendar" (
        "id" SERIAL NOT NULL,
        "scheduledAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "createdById" integer,
        "updatedById" integer,
        "gembaWalkZoneId" integer,
        CONSTRAINT "PK_gemba_walk_calendar_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_gemba_walk_calendar_scheduledAt"
      ON "gemba_walk_calendar" ("scheduledAt")
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walk_calendar"
      ADD CONSTRAINT "FK_gemba_walk_calendar_createdById"
      FOREIGN KEY ("createdById") REFERENCES "user"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walk_calendar"
      ADD CONSTRAINT "FK_gemba_walk_calendar_updatedById"
      FOREIGN KEY ("updatedById") REFERENCES "user"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walk_calendar"
      ADD CONSTRAINT "FK_gemba_walk_calendar_gembaWalkZoneId"
      FOREIGN KEY ("gembaWalkZoneId") REFERENCES "gemba_walk_zones"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "gemba_walk_calendar"`);
  }
}
