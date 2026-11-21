import type { CacheService } from './cache.service.js';

/**
 * Listado de un catálogo desde el caché compartido. Estos listados no
 * dependen del usuario (iguales para todos), salvo `includeInactive`: solo
 * administradores, y el servicio lo valida en cada petición, así que nunca se
 * cachea.
 */
export const cachedCatalog = <Load extends () => unknown>(
  cache: CacheService,
  catalog: string,
  query: { includeInactive?: unknown },
  // Algunos servicios devuelven una lista o una página según la consulta.
  load: Load,
): Promise<Awaited<ReturnType<Load>>> => {
  type Result = Awaited<ReturnType<Load>>;
  const run = async (): Promise<Result> => (await load()) as Result;
  return query.includeInactive === undefined
    ? cache.remember<Result>('catalogs', [catalog, query], run)
    : run();
};
