import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateGembaWalkObservers1791853200000 implements MigrationInterface {
  name = 'CreateGembaWalkObservers1791853200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "gemba_walk_observers" (
        "id" SERIAL NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "createdById" integer,
        "updatedById" integer,
        "manufacturingPlantId" integer,
        "gembaWalkZoneId" integer,
        "employeeId" integer,
        CONSTRAINT "PK_gemba_walk_observers_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walk_observers"
      ADD CONSTRAINT "FK_gemba_walk_observers_createdById"
      FOREIGN KEY ("createdById") REFERENCES "user"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walk_observers"
      ADD CONSTRAINT "FK_gemba_walk_observers_updatedById"
      FOREIGN KEY ("updatedById") REFERENCES "user"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walk_observers"
      ADD CONSTRAINT "FK_gemba_walk_observers_manufacturingPlantId"
      FOREIGN KEY ("manufacturingPlantId") REFERENCES "manufacturing_plant"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walk_observers"
      ADD CONSTRAINT "FK_gemba_walk_observers_gembaWalkZoneId"
      FOREIGN KEY ("gembaWalkZoneId") REFERENCES "gemba_walk_zones"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walk_observers"
      ADD CONSTRAINT "FK_gemba_walk_observers_employeeId"
      FOREIGN KEY ("employeeId") REFERENCES "employee"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "gemba_walk_observers"`);
  }
}
