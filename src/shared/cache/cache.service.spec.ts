import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const redisInstances: { url: string; options: object; on: jest.Mock }[] = [];
jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation((url: string, options: object) => {
    const instance = { url, options, on: jest.fn() };
    redisInstances.push(instance);
    return instance;
  }),
}));

import {
  CacheService,
  cacheKeyHash,
  createCacheRedis,
  type CacheClient,
} from './cache.service.js';

/** Redis en memoria: lo mínimo que usa CacheService. */
const memoryClient = () => {
  const store = new Map<string, string>();
  const ttl = new Map<string, number>();
  const client = {
    store,
    ttl,
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string, _mode, seconds) => {
      store.set(key, value);
      ttl.set(key, seconds);
      return 'OK';
    }),
    incr: jest.fn(async (key: string) => {
      const next = Number(store.get(key) ?? 0) + 1;
      store.set(key, String(next));
      return next;
    }),
    quit: jest.fn(async () => 'OK'),
  };
  return client;
};

const config = (values: Record<string, string> = {}) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

// set() no se espera: deja que termine antes de revisar.
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('CacheService', () => {
  let client: ReturnType<typeof memoryClient>;
  let cache: CacheService;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    client = memoryClient();
    cache = new CacheService(config(), client as unknown as CacheClient);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });
  afterEach(() => warn.mockRestore());

  it('la primera vez consulta y guarda; la siguiente responde del caché', async () => {
    const load = jest.fn(async () => ({ zones: [{ id: 1 }] }));

    await expect(
      cache.remember('catalogs', ['zones', {}], load),
    ).resolves.toEqual({ zones: [{ id: 1 }] });
    await flush();
    await expect(
      cache.remember('catalogs', ['zones', {}], load),
    ).resolves.toEqual({ zones: [{ id: 1 }] });

    expect(load).toHaveBeenCalledTimes(1);
    const [key] = [...client.store.keys()].filter((k) => !k.includes(':gen:'));
    expect(key).toMatch(/^cache:catalogs:0:[0-9a-f]{32}$/);
    expect(client.ttl.get(key)).toBe(600);
  });

  it('el dashboard vence antes (5 min) que los catálogos', async () => {
    await cache.remember('dashboard', ['x'], async () => 1);
    await flush();

    expect([...client.ttl.values()]).toEqual([300]);
  });

  it('lo que sale del caché pasó por JSON, igual que la respuesta HTTP', async () => {
    const createdAt = new Date('2026-11-20T10:00:00Z');
    await cache.remember('catalogs', 'k', async () => ({ createdAt }));
    await flush();

    await expect(
      cache.remember('catalogs', 'k', async () => ({ createdAt })),
    ).resolves.toEqual({ createdAt: '2026-11-20T10:00:00.000Z' });
  });

  it('invalidar cambia la generación: lo anterior ya no se sirve', async () => {
    const load = jest
      .fn()
      .mockResolvedValueOnce('viejo')
      .mockResolvedValueOnce('nuevo');
    await cache.remember('catalogs', 'k', load);
    await flush();

    await cache.invalidate(['catalogs', 'catalogs']);

    await expect(cache.remember('catalogs', 'k', load)).resolves.toBe('nuevo');
    expect(client.incr).toHaveBeenCalledTimes(1);
    expect(client.store.get('cache:gen:catalogs')).toBe('1');
  });

  it('invalidar un espacio no toca el otro', async () => {
    const load = jest.fn(async () => 'dato');
    await cache.remember('dashboard', 'k', load);
    await flush();

    await cache.invalidate(['catalogs']);
    await cache.remember('dashboard', 'k', load);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('la llave no depende del orden de los filtros ni de los que vienen vacíos', () => {
    expect(cacheKeyHash({ a: 1, b: [2, { c: 3, d: undefined }] })).toBe(
      cacheKeyHash({ b: [2, { c: 3 }], a: 1 }),
    );
    expect(cacheKeyHash({ a: 1 })).not.toBe(cacheKeyHash({ a: 2 }));
    expect(cacheKeyHash([undefined])).toBe(cacheKeyHash([null]));
  });

  it('un error al consultar se propaga y no se guarda', async () => {
    await expect(
      cache.remember('catalogs', 'k', async () => {
        throw new Error('BD caída');
      }),
    ).rejects.toThrow('BD caída');
    await flush();

    expect(client.set).not.toHaveBeenCalled();
  });

  it('no guarda respuestas vacías (undefined) ni muy grandes', async () => {
    await cache.remember('catalogs', 'vacio', async () => undefined);
    await cache.remember('catalogs', 'grande', async () =>
      'x'.repeat(2 * 1024 * 1024 + 1),
    );
    await flush();

    expect(client.set).not.toHaveBeenCalled();
  });

  it('si Redis falla al leer, consulta la base y avisa una vez por minuto', async () => {
    client.get.mockRejectedValue(new Error('ECONNREFUSED'));
    const load = jest.fn(async () => 'de la base');

    await expect(cache.remember('catalogs', 'k', load)).resolves.toBe(
      'de la base',
    );
    await cache.remember('catalogs', 'k', load);

    expect(load).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'Caché Redis no disponible al leer (se consulta la base): ECONNREFUSED',
    );

    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
    await cache.remember('catalogs', 'k', load);
    expect(warn).toHaveBeenCalledTimes(2);
    jest.restoreAllMocks();
  });

  it('si falla al guardar o invalidar solo avisa', async () => {
    client.set.mockRejectedValue(new Error('OOM'));
    await expect(cache.remember('catalogs', 'k', async () => 1)).resolves.toBe(
      1,
    );
    await flush();
    expect(warn).toHaveBeenCalledWith(
      'Caché Redis no disponible al guardar (se consulta la base): OOM',
    );

    warn.mockClear();
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
    client.incr.mockRejectedValue(new Error('timeout'));
    await expect(cache.invalidate(['dashboard'])).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      'Caché Redis no disponible al invalidar (se consulta la base): timeout',
    );
    jest.restoreAllMocks();
  });

  it('al apagar cierra la conexión (aunque falle)', async () => {
    client.quit.mockRejectedValue(new Error('ya cerrada'));

    await expect(cache.onModuleDestroy()).resolves.toBeUndefined();
    expect(client.quit).toHaveBeenCalled();
  });

  describe('status (health y deploy)', () => {
    it('up si Redis responde', async () => {
      await expect(cache.status()).resolves.toBe('up');
    });

    it('down si Redis falla (p. ej. NOAUTH), y lo avisa', async () => {
      client.get.mockRejectedValueOnce(
        new Error('NOAUTH Authentication required.'),
      );
      await expect(cache.status()).resolves.toBe('down');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('NOAUTH Authentication required.'),
      );
    });

    it('disabled sin CACHE_REDIS_URL', async () => {
      await expect(new CacheService(config()).status()).resolves.toBe(
        'disabled',
      );
    });
  });

  describe('sin CACHE_REDIS_URL', () => {
    it('consulta siempre la base y no hace nada al invalidar o apagar', async () => {
      const disabled = new CacheService(config());
      const load = jest.fn(async () => 'dato');

      await disabled.remember('catalogs', 'k', load);
      await disabled.remember('catalogs', 'k', load);
      await disabled.invalidate(['catalogs']);
      await disabled.onModuleDestroy();

      expect(load).toHaveBeenCalledTimes(2);
    });
  });

  describe('con CACHE_REDIS_URL', () => {
    beforeEach(() => (redisInstances.length = 0));

    it('se conecta sin cola fuera de línea y con tiempo límite corto', () => {
      new CacheService(
        config({ CACHE_REDIS_URL: 'redis://:clave@127.0.0.1:6382/0' }),
      );

      expect(redisInstances).toHaveLength(1);
      expect(redisInstances[0]).toMatchObject({
        url: 'redis://:clave@127.0.0.1:6382/0',
        options: {
          connectionName: 'api-cache',
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          commandTimeout: 250,
        },
      });
    });

    it('un error de conexión solo genera un aviso', () => {
      new CacheService(config({ CACHE_REDIS_URL: 'redis://127.0.0.1:6382' }));
      const [event, onError] = redisInstances[0].on.mock.calls[0];

      onError(new Error('ECONNREFUSED'));

      expect(event).toBe('error');
      expect(warn).toHaveBeenCalledWith(
        'Caché Redis no disponible al conectar (se consulta la base): ECONNREFUSED',
      );
    });

    it('createCacheRedis registra el manejador de errores', () => {
      const onError = jest.fn();

      createCacheRedis('redis://127.0.0.1:6382', onError);

      expect(redisInstances[0].on).toHaveBeenCalledWith('error', onError);
    });
  });
});
