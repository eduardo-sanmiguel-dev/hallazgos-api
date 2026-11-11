import { DB_POOL_DEFAULTS, dbPoolOptions } from './db-pool.config.js';

describe('dbPoolOptions', () => {
  it('sin variables: conexiones de larga vida (no las de 10 s de node-pg)', () => {
    expect(dbPoolOptions({})).toEqual({
      application_name: 'comportarte-api',
      max: 10,
      min: 2,
      idleTimeoutMillis: 300_000,
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
    });
    expect(DB_POOL_DEFAULTS.idleTimeoutMillis).toBeGreaterThan(10_000);
  });

  it('se ajusta con DB_POOL_MAX, DB_POOL_MIN y DB_POOL_IDLE_MS', () => {
    expect(
      dbPoolOptions({
        DB_POOL_MAX: '6',
        DB_POOL_MIN: '1',
        DB_POOL_IDLE_MS: '60000',
      }),
    ).toMatchObject({ max: 6, min: 1, idleTimeoutMillis: 60_000 });
  });

  it('valores no válidos usan los de por defecto', () => {
    expect(
      dbPoolOptions({
        DB_POOL_MAX: 'diez',
        DB_POOL_MIN: '-1',
        DB_POOL_IDLE_MS: '1.5',
      }),
    ).toMatchObject(DB_POOL_DEFAULTS);
  });

  it('el mínimo nunca supera al máximo y el máximo es al menos 1', () => {
    expect(dbPoolOptions({ DB_POOL_MAX: '1', DB_POOL_MIN: '5' })).toMatchObject(
      { max: 1, min: 1 },
    );
    expect(dbPoolOptions({ DB_POOL_MAX: '0' })).toMatchObject({ max: 1 });
  });

  it('DB_POOL_IDLE_MS=0 desactiva el cierre por inactividad', () => {
    expect(dbPoolOptions({ DB_POOL_IDLE_MS: '0' }).idleTimeoutMillis).toBe(0);
  });
});
