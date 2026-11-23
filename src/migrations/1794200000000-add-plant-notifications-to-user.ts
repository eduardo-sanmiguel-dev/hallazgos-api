import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Baja de los avisos de toda la planta: columna `plantNotifications` en `user`.
 *
 * Los correos que se mandan a todos los usuarios de una planta (hallazgo
 * creado o cancelado, y solucionado en la planta 3) llevan un enlace para
 * dejar de recibirlos; en false, `findAllByPlant` omite al usuario. Los avisos
 * personales (responsable asignado o reasignado, hallazgos propios) y la
 * recuperación de contraseña no dependen de ella.
 *
 * Default true: todos siguen recibiendo lo mismo que antes del deploy, y el
 * código anterior (que no conoce la columna) sigue funcionando mientras PM2
 * recarga. IF NOT EXISTS la hace segura si se corre dos veces.
 */
export class AddPlantNotificationsToUser1794200000000 implements MigrationInterface {
  name = 'AddPlantNotificationsToUser1794200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "plantNotifications" boolean NOT NULL DEFAULT true`,
    );
  }

  /** Quita solo la columna que agregó `up`. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN IF EXISTS "plantNotifications"`,
    );
  }
}
