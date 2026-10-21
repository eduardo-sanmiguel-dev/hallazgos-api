// globalSetup corre fuera del runtime de Jest, sin moduleNameMapper: un
// import con extensión .js no resolvería al archivo .ts.
const { ensureTestDatabase, TEST_DB_NAME, useTestEnvironment } =
  require('./test-database') as typeof import('./test-database.js');

/**
 * Una vez por corrida: la base de pruebas existe. El esquema lo recrea cada
 * archivo de pruebas (recreateTestSchema): aquí no aplica el mapeo de
 * módulos de Jest que necesitan las entidades.
 */
export default async () => {
  useTestEnvironment();
  await ensureTestDatabase();
  console.log(`\nBase de pruebas: ${TEST_DB_NAME}`);
};
