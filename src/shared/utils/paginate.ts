import type { FindManyOptions, ObjectLiteral, Repository } from 'typeorm';

/**
 * Listado paginado en la BD con el mismo `options` del listado completo.
 * `page` es 1-based; `limit = -1` devuelve todos los registros.
 * Los query params llegan como texto (el ValidationPipe global no transforma).
 */
export async function findPaginated<T extends ObjectLiteral>(
  repository: Repository<T>,
  options: FindManyOptions<T>,
  page: number | string,
  limit: number | string,
) {
  const pageNumber = Math.max(1, Number(page) || 1);
  const limitNumber = Number(limit);

  const [data, count] = await repository.findAndCount({
    ...options,
    ...(limitNumber > 0 && {
      take: limitNumber,
      skip: (pageNumber - 1) * limitNumber,
    }),
  });

  return { data, count };
}
