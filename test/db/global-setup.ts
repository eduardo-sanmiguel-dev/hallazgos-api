import {
  ensureTestDatabase,
  TEST_DB_NAME,
  useTestEnvironment,
} from './test-database';

/**
 * Una vez por corrida: la base de pruebas existe. El esquema lo recrea cada
 * archivo de pruebas (recreateTestSchema): aquí no aplican los alias de
 * módulos de Jest que necesitan las entidades.
 */
export default async () => {
  useTestEnvironment();
  await ensureTestDatabase();
  console.log(`\nBase de pruebas: ${TEST_DB_NAME}`);
};
