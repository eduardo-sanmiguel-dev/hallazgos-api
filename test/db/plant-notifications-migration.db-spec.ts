/**
 * Migración AddPlantNotificationsToUser contra la base de pruebas. Cada caso
 * corre en una transacción que se revierte, con su propia tabla "user" sin la
 * columna (como en producción) en un esquema temporal: no toca la tabla real
 * que usan las demás pruebas.
 */
import { type DataSource, type QueryRunner } from 'typeorm';

import { AddPlantNotificationsToUser1794200000000 } from '../../src/migrations/1794200000000-add-plant-notifications-to-user.js';
import { createTestDataSource } from './test-database.js';

describe('Migración: plantNotifications en usuarios', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  const migration = new AddPlantNotificationsToUser1794200000000();

  beforeAll(async () => {
    dataSource = createTestDataSource();
    await dataSource.initialize();
  });

  afterAll(() => dataSource.destroy());

  beforeEach(async () => {
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    await queryRunner.query(`CREATE SCHEMA migration_test`);
    await queryRunner.query(`SET LOCAL search_path TO migration_test`);
    await queryRunner.query(
      `CREATE TABLE "user" (id SERIAL PRIMARY KEY, email VARCHAR NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "user" (email) VALUES ('a@hallazgos.test'), ('b@hallazgos.test')`,
    );
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  });

  const values = async () =>
    (
      await queryRunner.query(
        `SELECT "plantNotifications" FROM "user" ORDER BY id`,
      )
    ).map((row: { plantNotifications: boolean }) => row.plantNotifications);

  const hasColumn = async () => {
    const [{ exists }] = await queryRunner.query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'migration_test'
           AND table_name = 'user' AND column_name = 'plantNotifications'
      ) AS exists`,
    );
    return exists as boolean;
  };

  it('los usuarios existentes siguen recibiendo los avisos de la planta', async () => {
    await migration.up(queryRunner);

    expect(await values()).toEqual([true, true]);
  });

  it('el código anterior (sin la columna) sigue insertando usuarios que la reciben', async () => {
    await migration.up(queryRunner);
    await queryRunner.query(
      `INSERT INTO "user" (email) VALUES ('c@hallazgos.test')`,
    );

    expect(await values()).toEqual([true, true, true]);
    await expect(
      queryRunner.query(`UPDATE "user" SET "plantNotifications" = NULL`),
    ).rejects.toThrow(/null/i);
  });

  it('se puede correr dos veces y down quita solo la columna', async () => {
    await migration.up(queryRunner);
    await migration.up(queryRunner);
    expect(await hasColumn()).toBe(true);

    await migration.down(queryRunner);
    expect(await hasColumn()).toBe(false);
    const [{ total }] = await queryRunner.query(
      `SELECT count(*)::int AS total FROM "user"`,
    );
    expect(total).toBe(2);
  });
});
