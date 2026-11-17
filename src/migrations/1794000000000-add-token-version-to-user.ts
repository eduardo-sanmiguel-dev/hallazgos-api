import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Versión de sesión de cada usuario: columna `tokenVersion` en `user`.
 *
 * Los tokens de sesión llevan la versión con la que se emitieron (`tv`); al
 * subirla (cerrar sesión en todos los dispositivos, restablecer o cambiar la
 * contraseña) los tokens anteriores dejan de servir.
 *
 * Solo agrega una columna con default 0: los usuarios existentes quedan en 0
 * y los tokens emitidos antes (sin `tv`) se toman como versión 0, así que
 * nadie pierde su sesión con el deploy. IF NOT EXISTS la hace segura si se
 * corre dos veces.
 */
export class AddTokenVersionToUser1794000000000 implements MigrationInterface {
  name = 'AddTokenVersionToUser1794000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "tokenVersion" integer NOT NULL DEFAULT 0`,
    );
  }

  /** Quita solo la columna que agregó `up`. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN IF EXISTS "tokenVersion"`,
    );
  }
}
