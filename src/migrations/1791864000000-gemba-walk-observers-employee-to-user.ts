import { type MigrationInterface, type QueryRunner } from 'typeorm';

/*
 * Los observadores pasan de colaboradores (employee) a usuarios del sistema
 * (user), para validar el acceso al módulo Gemba Walk con el usuario de la
 * sesión. No hay relación employee↔user, así que los registros previos no se
 * pueden convertir: se desactivan y deben capturarse de nuevo.
 */
export class GembaWalkObserversEmployeeToUser1791864000000 implements MigrationInterface {
  name = 'GembaWalkObserversEmployeeToUser1791864000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "gemba_walk_observers" SET "isActive" = false
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walk_observers"
      DROP CONSTRAINT "FK_gemba_walk_observers_employeeId"
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walk_observers" DROP COLUMN "employeeId"
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walk_observers" ADD "userId" integer
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walk_observers"
      ADD CONSTRAINT "FK_gemba_walk_observers_userId"
      FOREIGN KEY ("userId") REFERENCES "user"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "gemba_walk_observers"
      DROP CONSTRAINT "FK_gemba_walk_observers_userId"
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walk_observers" DROP COLUMN "userId"
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walk_observers" ADD "employeeId" integer
    `);

    await queryRunner.query(`
      ALTER TABLE "gemba_walk_observers"
      ADD CONSTRAINT "FK_gemba_walk_observers_employeeId"
      FOREIGN KEY ("employeeId") REFERENCES "employee"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }
}
