/**
 * Migración AddTokenVersionToUser contra la base de pruebas. Cada caso corre
 * en una transacción que se revierte, con su propia tabla "user" sin la
 * columna (como en producción) en un esquema temporal: no toca la tabla real
 * que usan las demás pruebas.
 */
import { type DataSource, type QueryRunner } from 'typeorm';

import { AddTokenVersionToUser1794000000000 } from '../../src/migrations/1794000000000-add-token-version-to-user.js';
import { createTestDataSource } from './test-database.js';

describe('Migración: tokenVersion en usuarios', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  const migration = new AddTokenVersionToUser1794000000000();

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

  const versions = async () =>
    (
      await queryRunner.query(`SELECT "tokenVersion" FROM "user" ORDER BY id`)
    ).map((row: { tokenVersion: number }) => row.tokenVersion);

  const hasColumn = async () => {
    const [{ exists }] = await queryRunner.query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'migration_test'
           AND table_name = 'user' AND column_name = 'tokenVersion'
      ) AS exists`,
    );
    return exists as boolean;
  };

  it('agrega la columna con 0 en los usuarios existentes (nadie pierde la sesión)', async () => {
    await migration.up(queryRunner);

    expect(await versions()).toEqual([0, 0]);
  });

  it('los usuarios nuevos empiezan en 0 y la columna no acepta nulos', async () => {
    await migration.up(queryRunner);
    await queryRunner.query(
      `INSERT INTO "user" (email) VALUES ('c@hallazgos.test')`,
    );

    expect(await versions()).toEqual([0, 0, 0]);
    await expect(
      queryRunner.query(`UPDATE "user" SET "tokenVersion" = NULL`),
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
