/**
 * Migración CreateIdempotencyKeys contra la base de pruebas, en un esquema
 * temporal dentro de una transacción que se revierte (como la migración de
 * requires_evidence): no toca las tablas que usan las demás pruebas.
 */
import { type DataSource, type QueryRunner } from 'typeorm';

import { CreateIdempotencyKeys1792900000000 } from '../../src/migrations/1792900000000-create-idempotency-keys.js';
import { createTestDataSource, recreateTestSchema } from './test-database.js';

const columnsOf = (queryRunner: QueryRunner, schema: string) =>
  queryRunner.query(
    `SELECT column_name, data_type, is_nullable, character_maximum_length
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'idempotency_key'
      ORDER BY column_name`,
    [schema],
  );

describe('Migración: tabla idempotency_key', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  const migration = new CreateIdempotencyKeys1792900000000();

  beforeAll(async () => {
    await recreateTestSchema();
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
    await queryRunner.query(`CREATE TABLE "user" (id SERIAL PRIMARY KEY)`);
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  });

  it('crea la tabla con las mismas columnas que la entidad', async () => {
    await migration.up(queryRunner);

    // "public" la crea la entidad (synchronize) en el esquema de pruebas.
    expect(await columnsOf(queryRunner, 'migration_test')).toEqual(
      await columnsOf(queryRunner, 'public'),
    );
  });

  it('la clave es única por usuario y se borra con el usuario', async () => {
    await migration.up(queryRunner);
    const [{ id }] = await queryRunner.query(
      `INSERT INTO "user" DEFAULT VALUES RETURNING id`,
    );
    const key = '0b6f7c1e-3d0e-4a53-9a39-4f2a7f1d2c11';
    await queryRunner.query(
      `INSERT INTO "idempotency_key" (user_id, key, route) VALUES ($1, $2, 'POST /x')`,
      [id, key],
    );

    const [row] = await queryRunner.query(`SELECT * FROM "idempotency_key"`);
    expect(row).toMatchObject({ status: 'processing', response: null });

    await queryRunner.query(`DELETE FROM "user" WHERE id = $1`, [id]);
    expect(await queryRunner.query(`SELECT 1 FROM "idempotency_key"`)).toEqual(
      [],
    );
  });

  it('down borra la tabla', async () => {
    await migration.up(queryRunner);
    await migration.down(queryRunner);

    expect(await columnsOf(queryRunner, 'migration_test')).toEqual([]);
  });
});
