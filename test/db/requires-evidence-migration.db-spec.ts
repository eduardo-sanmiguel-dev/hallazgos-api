/**
 * Migración AddRequiresEvidenceToMainTypes contra la base de pruebas. Cada
 * caso corre en una transacción que se revierte, con su propia tabla
 * "main_type" sin la columna (como en producción) en un esquema temporal: no
 * bloquea ni cambia la tabla real que usan las demás pruebas en paralelo.
 */
import { type DataSource, type QueryRunner } from 'typeorm';

import { AddRequiresEvidenceToMainTypes1792860000000 } from '../../src/migrations/1792860000000-add-requires-evidence-to-main-types.js';
import { createTestDataSource } from './test-database.js';

describe('Migración: requires_evidence en clasificaciones', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  const migration = new AddRequiresEvidenceToMainTypes1792860000000();

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
      `CREATE TABLE "main_type" (id SERIAL PRIMARY KEY, name VARCHAR NOT NULL UNIQUE)`,
    );
    await insertMainType('Condición insegura');
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  });

  const insertMainType = async (name: string) => {
    const [{ id }] = await queryRunner.query(
      `INSERT INTO "main_type" (name) VALUES ($1) RETURNING id`,
      [name],
    );
    return id as number;
  };

  const flags = async () =>
    Object.fromEntries(
      (
        await queryRunner.query(
          `SELECT name, requires_evidence FROM "main_type"`,
        )
      ).map(({ name, requires_evidence }) => [name, requires_evidence]),
    );

  it('con exactamente una coincidencia solo esa queda sin foto obligatoria', async () => {
    await insertMainType('Comportamiento inseguro');
    // No coincide: "condición insegura" no es "comportamiento inseguro".
    await insertMainType('Comportamiento por condición insegura');

    await migration.up(queryRunner);

    const result = await flags();
    expect(result['Comportamiento inseguro']).toBe(false);
    expect(result['Comportamiento por condición insegura']).toBe(true);
    expect(result['Condición insegura']).toBe(true);
  });

  it('reconoce el nombre sin importar mayúsculas', async () => {
    await insertMainType('COMPORTAMIENTO INSEGURO');

    await migration.up(queryRunner);

    expect((await flags())['COMPORTAMIENTO INSEGURO']).toBe(false);
  });

  it('sin coincidencias falla con un mensaje claro', async () => {
    await expect(migration.up(queryRunner)).rejects.toThrow(
      'se esperaba exactamente una clasificación cuyo nombre contenga "comportamiento inseguro" y se encontraron 0 (ninguna)',
    );
  });

  it('con varias coincidencias falla y las nombra', async () => {
    const first = await insertMainType('Comportamiento inseguro');
    const second = await insertMainType('Comportamiento inseguro (viejo)');

    await expect(migration.up(queryRunner)).rejects.toThrow(
      `se encontraron 2 (#${first} "Comportamiento inseguro", #${second} "Comportamiento inseguro (viejo)")`,
    );
  });

  it('down quita la columna', async () => {
    await insertMainType('Comportamiento inseguro');
    await migration.up(queryRunner);

    await migration.down(queryRunner);

    const columns = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'migration_test' AND table_name = 'main_type'
          AND column_name = 'requires_evidence'`,
    );
    expect(columns).toEqual([]);
  });
});
