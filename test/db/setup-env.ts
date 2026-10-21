import { useTestEnvironment } from './test-database.js';

// Cada archivo de pruebas corre en su propio entorno: las variables que fijó
// globalSetup no llegan aquí, así que se vuelven a fijar.
useTestEnvironment();

// El paquete es ESM, así que TypeORM carga entidades y migraciones con
// import(). Jest transpila los .ts a CommonJS y ese import() devuelve cada
// clase dos veces (export nombrado y dentro de default): TypeORM las vería
// duplicadas. En las pruebas se cargan con require, como antes de ESM.
jest.mock('typeorm/util/ImportUtils.js', () => ({
  ...jest.requireActual('typeorm/util/ImportUtils.js'),
  importOrRequireFile: async (filePath: string) => [
    require(filePath),
    'commonjs',
  ],
}));
