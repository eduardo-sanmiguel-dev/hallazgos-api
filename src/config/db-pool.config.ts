/**
 * Pool de conexiones de la API a PostgreSQL (opciones `extra` de node-pg).
 *
 * Antes usaba los valores por defecto: cada conexión se cerraba tras 10 s sin
 * uso, y con el tráfico intermitente de la app casi cada ráfaga de clics
 * abría conexiones nuevas (TCP + autenticación scram-sha-256): 4,558 en una
 * semana, p50 24 ms y p95 100 ms al inicio de las peticiones.
 *
 * Con 2 workers de pm2 el máximo es 2 × max conexiones (PostgreSQL permite
 * 100 y no cierra sesiones inactivas por su cuenta).
 */
export const DB_POOL_DEFAULTS = {
  max: 10,
  // Conexiones que se mantienen abiertas aunque no se usen.
  min: 2,
  // Las que sobran del mínimo se cierran tras 5 min sin uso.
  idleTimeoutMillis: 5 * 60 * 1000,
} as const;

const positiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return value !== undefined &&
    value !== '' &&
    Number.isInteger(parsed) &&
    parsed >= 0
    ? parsed
    : fallback;
};

export const dbPoolOptions = (env: NodeJS.ProcessEnv = process.env) => {
  const max = Math.max(1, positiveInt(env.DB_POOL_MAX, DB_POOL_DEFAULTS.max));
  return {
    // Identifica a la API en pg_stat_activity (el worker usa el suyo).
    application_name: 'comportarte-api',
    max,
    min: Math.min(max, positiveInt(env.DB_POOL_MIN, DB_POOL_DEFAULTS.min)),
    idleTimeoutMillis: positiveInt(
      env.DB_POOL_IDLE_MS,
      DB_POOL_DEFAULTS.idleTimeoutMillis,
    ),
    // Sin esto, con el pool lleno una petición esperaría conexión sin límite.
    connectionTimeoutMillis: 10_000,
    // Conexiones de larga vida: detecta las que se cortaron en la red.
    keepAlive: true,
  };
};
