import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateGembaWalkZones1791849600000 implements MigrationInterface {
  name = 'CreateGembaWalkZones1791849600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "gemba_walk_zones" (
        "id" SERIAL NOT NULL,
        "nameZone" character varying NOT NULL,
        "nameLocation" character varying NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "createdById" integer,
        "updatedById" integer,
        "manufacturingPlantId" integer,
        CONSTRAINT "PK_gemba_walk_zones_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walk_zones"
      ADD CONSTRAINT "FK_gemba_walk_zones_createdById"
      FOREIGN KEY ("createdById") REFERENCES "user"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walk_zones"
      ADD CONSTRAINT "FK_gemba_walk_zones_updatedById"
      FOREIGN KEY ("updatedById") REFERENCES "user"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walk_zones"
      ADD CONSTRAINT "FK_gemba_walk_zones_manufacturingPlantId"
      FOREIGN KEY ("manufacturingPlantId") REFERENCES "manufacturing_plant"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "gemba_walk_zones"`);
  }
}
