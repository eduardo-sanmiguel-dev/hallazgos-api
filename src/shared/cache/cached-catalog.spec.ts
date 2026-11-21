import { cachedCatalog } from './cached-catalog.js';
import type { CacheService } from './cache.service.js';

describe('cachedCatalog', () => {
  const remember = jest.fn(
    async (_namespace: string, _key: unknown, load: () => Promise<unknown>) =>
      load(),
  );
  const cache = { remember } as unknown as CacheService;

  beforeEach(() => remember.mockClear());

  it('usa el caché de catálogos con el nombre y los filtros como llave', async () => {
    const query = { name: 'Pasillo', includeInactive: undefined };

    await expect(
      cachedCatalog(cache, 'zones', query, () => Promise.resolve(['zona'])),
    ).resolves.toEqual(['zona']);

    expect(remember).toHaveBeenCalledWith(
      'catalogs',
      ['zones', query],
      expect.any(Function),
    );
  });

  it('con includeInactive (solo administradores) nunca usa el caché', async () => {
    const load = jest.fn(async () => ({ data: [], count: 0 }));

    await expect(
      cachedCatalog(cache, 'zones', { includeInactive: 'true' }, load),
    ).resolves.toEqual({ data: [], count: 0 });
    await cachedCatalog(cache, 'zones', { includeInactive: 'false' }, load);

    expect(remember).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
