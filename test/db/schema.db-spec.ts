import { DataSource } from 'typeorm';

import { seedBaseData } from './fixtures';
import {
  createTestDataSource,
  recreateTestSchema,
  TEST_DB_NAME,
} from './test-database';

describe('Base de pruebas', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    await recreateTestSchema();
    dataSource = createTestDataSource();
    await dataSource.initialize();
  });

  afterAll(() => dataSource.destroy());

  it('es la base aislada de pruebas, nunca la de desarrollo', async () => {
    const [{ current_database }] = await dataSource.query(
      'SELECT current_database()',
    );

    expect(current_database).toBe(TEST_DB_NAME);
    expect(current_database).toMatch(/_test$/);
  });

  it('tiene el esquema completo y las migraciones marcadas como ejecutadas', async () => {
    const [{ count }] = await dataSource.query(
      `SELECT count(*)::int AS count FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'evidence'`,
    );
    const migrations = await dataSource.query('SELECT name FROM migrations');

    expect(count).toBe(1);
    expect(migrations.length).toBeGreaterThan(0);
  });

  it('los datos base se pueden sembrar y volver a sembrar', async () => {
    await seedBaseData(dataSource);
    const base = await seedBaseData(dataSource);

    const users = await dataSource.query(
      'SELECT count(*)::int AS n FROM "user"',
    );
    expect(users[0].n).toBe(4);
    expect(base.plants.tepotzotlan.id).toBe(1);
  });
});
