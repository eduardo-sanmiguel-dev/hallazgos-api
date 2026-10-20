/**
 * Base de datos de pruebas aislada (PostgreSQL local o temporal de CI).
 *
 * - Credenciales: variables del servicio temporal en CI; en local se puede
 *   usar el archivo de desarrollo sin copiar sus valores a otro archivo.
 * - Base: `TEST_DB_NAME` o `hallazgos_test`. Por seguridad el nombre DEBE
 *   terminar en `_test`: el esquema se borra y se vuelve a crear en cada
 *   corrida.
 * - Esquema: se crea desde las entidades (`synchronize`); las migraciones del
 *   proyecto son incrementales y no crean el esquema desde cero, así que se
 *   marcan como ya ejecutadas para que el AppModule (`migrationsRun`) no las
 *   repita.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
import { DataSource } from 'typeorm';

const ROOT = join(__dirname, '..', '..');

export const TEST_DB_NAME = process.env.TEST_DB_NAME || 'hallazgos_test';

/** Lee `.env.development` sin pisar variables ya definidas. */
const loadDevelopmentEnv = () => {
  const file = join(ROOT, '.env.development');
  if (!existsSync(file)) {
    return;
  }

  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;

    const key = trimmed.slice(0, trimmed.indexOf('=')).trim();
    const value = trimmed
      .slice(trimmed.indexOf('=') + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
};

/**
 * Prepara `process.env` para la base de pruebas. NODE_ENV=test: el AppModule
 * busca `.env.test` (no existe) y usa estas variables.
 */
export const useTestEnvironment = () => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Las pruebas de base de datos no pueden ejecutarse en producción',
    );
  }

  // En CI nunca cargar archivos locales: solo las variables del servicio temporal.
  if (process.env.CI !== 'true') {
    loadDevelopmentEnv();
  }

  const required = ['DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(
      `Faltan variables de PostgreSQL de pruebas: ${missing.join(', ')}`,
    );
  }

  if (
    process.env.CI === 'true' &&
    !['127.0.0.1', 'localhost', '::1'].includes(process.env.DB_HOST)
  ) {
    throw new Error(
      'En CI las pruebas solo pueden conectarse a PostgreSQL local temporal',
    );
  }

  if (!/^[a-z_][a-z0-9_]*_test$/i.test(TEST_DB_NAME)) {
    throw new Error(
      `TEST_DB_NAME debe terminar en "_test" (recibido "${TEST_DB_NAME}"): la base se borra en cada corrida`,
    );
  }

  process.env.DB_NAME = TEST_DB_NAME;
  process.env.NODE_ENV = 'test';
  // El JWT de prueba no debe servir en desarrollo ni al revés.
  process.env.JWT_SECRET_KEY = 'jwt-secreto-solo-para-pruebas';
  process.env.APP_KEY = 'app-key-de-pruebas';
};

const connectionOptions = () => ({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
});

/** Crea la base de pruebas si no existe (conectándose a "postgres"). */
export const ensureTestDatabase = async () => {
  const client = new Client({ ...connectionOptions(), database: 'postgres' });
  await client.connect();

  try {
    const { rowCount } = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [TEST_DB_NAME],
    );
    if (!rowCount) await client.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
  } finally {
    await client.end();
  }
};

/** DataSource de la base de pruebas con todas las entidades del proyecto. */
export const createTestDataSource = (options: { recreate?: boolean } = {}) =>
  new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: TEST_DB_NAME,
    entities: [join(ROOT, 'src', '**', 'entities', '*.ts')],
    synchronize: !!options.recreate,
    dropSchema: !!options.recreate,
    logging: false,
  });

/** Registra todas las migraciones como ejecutadas (el esquema ya está al día). */
const markMigrationsAsRun = async (dataSource: DataSource) => {
  await dataSource.query(
    `CREATE TABLE IF NOT EXISTS migrations (
       id SERIAL PRIMARY KEY,
       "timestamp" BIGINT NOT NULL,
       name VARCHAR NOT NULL
     )`,
  );

  const files = readdirSync(join(ROOT, 'src', 'migrations')).filter((file) =>
    /^\d+-.+\.ts$/.test(file),
  );

  for (const file of files) {
    const source = readFileSync(join(ROOT, 'src', 'migrations', file), 'utf8');
    const name = source.match(/export class (\w+)/)?.[1];
    const timestamp = name?.match(/(\d{13})$/)?.[1];
    if (!name || !timestamp) continue;

    await dataSource.query(
      'INSERT INTO migrations ("timestamp", name) VALUES ($1, $2)',
      [timestamp, name],
    );
  }
};

/** Borra y vuelve a crear el esquema completo de la base de pruebas. */
export const recreateTestSchema = async () => {
  const dataSource = createTestDataSource({ recreate: true });
  await dataSource.initialize();

  try {
    await markMigrationsAsRun(dataSource);
  } finally {
    await dataSource.destroy();
  }
};
