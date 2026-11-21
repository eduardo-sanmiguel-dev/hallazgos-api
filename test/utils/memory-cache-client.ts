import type { CacheClient } from '../../src/shared/cache/cache.service.js';

/** Redis en memoria con lo que usa CacheService (sin TTL). */
export const memoryCacheClient = () => {
  const store = new Map<string, string>();
  const client: CacheClient & { store: Map<string, string> } = {
    store,
    get: async (key) => store.get(key) ?? null,
    set: async (key, value) => store.set(key, value),
    incr: async (key) => {
      const next = Number(store.get(key) ?? 0) + 1;
      store.set(key, String(next));
      return next;
    },
    quit: async () => 'OK',
  };
  return client;
};
