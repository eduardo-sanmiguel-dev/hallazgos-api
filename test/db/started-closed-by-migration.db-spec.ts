/**
 * Migración AddStartedAndClosedByToEvidence contra la base de pruebas. Cada
 * caso corre en una transacción que se revierte, con sus propias tablas
 * "user" y "evidence" (como en producción, sin las columnas nuevas) en un
 * esquema temporal: no toca las tablas que usan las demás pruebas.
 */
import { type DataSource, type QueryRunner } from 'typeorm';

import { AddStartedAndClosedByToEvidence1793000000000 } from '../../src/migrations/1793000000000-add-started-and-closed-by-to-evidence.js';
import { createTestDataSource } from './test-database.js';

describe('Migración: quién inició y quién cerró cada hallazgo', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  const migration = new AddStartedAndClosedByToEvidence1793000000000();

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
      `CREATE TABLE "user" (id SERIAL PRIMARY KEY, name VARCHAR NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE "evidence" (
        id SERIAL PRIMARY KEY,
        status VARCHAR NOT NULL,
        description VARCHAR NOT NULL DEFAULT '',
        "startProcessDate" TIMESTAMP,
        "solutionDate" TIMESTAMP,
        "userId" INTEGER REFERENCES "user"(id)
      )`,
    );
    await queryRunner.query(
      `INSERT INTO "user" (name) VALUES ('Ana'), ('Luis')`,
    );
    await queryRunner.query(
      `INSERT INTO "evidence" (status, description, "startProcessDate", "solutionDate", "userId") VALUES
        ('Abierto', 'Derrame', NULL, NULL, 1),
        ('En progreso', 'Cable suelto', '2026-10-01 10:00', NULL, 1),
        ('Cerrado', 'Sin casco', '2026-10-02 09:00', '2026-10-03 12:00', 2)`,
    );
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  });

  const rows = () =>
    queryRunner.query(
      `SELECT id, status, description, "startProcessDate", "solutionDate", "userId" FROM "evidence" ORDER BY id`,
    );

  const columns = async () =>
    (
      await queryRunner.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'migration_test' AND table_name = 'evidence'
          ORDER BY ordinal_position`,
      )
    ).map(({ column_name }: { column_name: string }) => column_name);

  it('agrega las dos columnas en nulo sin cambiar ningún dato existente', async () => {
    const before = await rows();

    await migration.up(queryRunner);

    expect(await rows()).toEqual(before);
    expect(await columns()).toEqual(
      expect.arrayContaining(['startedById', 'closedById']),
    );
    expect(
      await queryRunner.query(
        `SELECT "startedById", "closedById" FROM "evidence"`,
      ),
    ).toEqual(Array(3).fill({ startedById: null, closedById: null }));
  });

  it('se puede correr dos veces sin error', async () => {
    await migration.up(queryRunner);
    await expect(migration.up(queryRunner)).resolves.toBeUndefined();
  });

  it('guarda el usuario y, si ese usuario se borra, solo queda en nulo', async () => {
    await migration.up(queryRunner);
    await queryRunner.query(
      `UPDATE "evidence" SET "startedById" = 2, "closedById" = 2 WHERE id = 3`,
    );

    await queryRunner.query(
      `DELETE FROM "evidence" WHERE "userId" = 2 AND id <> 3`,
    );
    await queryRunner.query(`UPDATE "evidence" SET "userId" = 1 WHERE id = 3`);
    await queryRunner.query(`DELETE FROM "user" WHERE id = 2`);

    expect(
      await queryRunner.query(
        `SELECT id, status, "startedById", "closedById" FROM "evidence" WHERE id = 3`,
      ),
    ).toEqual([
      { id: 3, status: 'Cerrado', startedById: null, closedById: null },
    ]);
  });

  it('rechaza un usuario que no existe', async () => {
    await migration.up(queryRunner);

    await expect(
      queryRunner.query(
        `UPDATE "evidence" SET "closedById" = 999 WHERE id = 1`,
      ),
    ).rejects.toThrow(/FK_evidence_closedById/);
  });

  it('down quita solo las columnas nuevas y conserva los datos', async () => {
    const before = await rows();
    const original = await columns();

    await migration.up(queryRunner);
    await migration.down(queryRunner);

    expect(await columns()).toEqual(original);
    expect(await rows()).toEqual(before);
  });
});
