/**
 * Migración AddEvidenceQueryIndexes contra la base de pruebas. Cada caso corre
 * en una transacción que se revierte, con su propia tabla "evidence" sin los
 * índices (como en producción) en un esquema temporal: no toca la tabla real
 * que usan las demás pruebas.
 */
import { type DataSource, type QueryRunner } from 'typeorm';

import { AddEvidenceQueryIndexes1794100000000 } from '../../src/migrations/1794100000000-add-evidence-query-indexes.js';
import { createTestDataSource, recreateTestSchema } from './test-database.js';

const NAMES = [
  'IDX_evidence_imgEvidence',
  'IDX_evidence_imgProcess',
  'IDX_evidence_imgSolution',
  'IDX_evidence_manufacturingPlantId_createdAt',
];

describe('Migración: índices de consultas de hallazgos', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  const migration = new AddEvidenceQueryIndexes1794100000000();

  beforeAll(async () => {
    // Esquema de las entidades actuales: el segundo caso lo compara con la
    // migración.
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
    await queryRunner.query(
      `CREATE TABLE "evidence" (
        id SERIAL PRIMARY KEY,
        "imgEvidence" varchar NOT NULL,
        "imgSolution" varchar NOT NULL DEFAULT '',
        "imgProcess" varchar NOT NULL DEFAULT '',
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "manufacturingPlantId" integer
      )`,
    );
    await queryRunner.query(
      `INSERT INTO "evidence" ("imgEvidence", "manufacturingPlantId") VALUES ('a.png', 1), ('b.png', 2)`,
    );
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  });

  /** Definición de cada índice nuevo del esquema, sin el nombre del esquema. */
  const indexes = async (schema: string) =>
    Object.fromEntries(
      (
        await queryRunner.query(
          `SELECT indexname, indexdef FROM pg_indexes
            WHERE schemaname = $1 AND tablename = 'evidence'
              AND indexname = ANY($2) ORDER BY indexname`,
          [schema, NAMES],
        )
      ).map((row: { indexname: string; indexdef: string }) => [
        row.indexname,
        row.indexdef.replace(`${schema}.`, ''),
      ]),
    );

  it('crea los índices de planta + fecha y de las tres columnas de fotos', async () => {
    await migration.up(queryRunner);

    expect(await indexes('migration_test')).toEqual({
      IDX_evidence_imgEvidence:
        'CREATE INDEX "IDX_evidence_imgEvidence" ON evidence USING btree ("imgEvidence")',
      IDX_evidence_imgProcess:
        'CREATE INDEX "IDX_evidence_imgProcess" ON evidence USING btree ("imgProcess")',
      IDX_evidence_imgSolution:
        'CREATE INDEX "IDX_evidence_imgSolution" ON evidence USING btree ("imgSolution")',
      IDX_evidence_manufacturingPlantId_createdAt:
        'CREATE INDEX "IDX_evidence_manufacturingPlantId_createdAt" ON evidence USING btree ("manufacturingPlantId", "createdAt")',
    });
  });

  it('deja los mismos índices que las entidades (esquema de pruebas)', async () => {
    await migration.up(queryRunner);

    expect(await indexes('migration_test')).toEqual(await indexes('public'));
  });

  it('se puede correr dos veces y down quita solo sus índices', async () => {
    await migration.up(queryRunner);
    await migration.up(queryRunner);
    expect(Object.keys(await indexes('migration_test'))).toEqual(NAMES);

    await migration.down(queryRunner);
    expect(await indexes('migration_test')).toEqual({});
    const [{ total, pk }] = await queryRunner.query(
      `SELECT (SELECT count(*)::int FROM "evidence") AS total,
              (SELECT count(*)::int FROM pg_indexes
                WHERE schemaname = 'migration_test' AND tablename = 'evidence') AS pk`,
    );
    expect({ total, pk }).toEqual({ total: 2, pk: 1 });
  });
});
