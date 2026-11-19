import type { FindManyOptions, ObjectLiteral, Repository } from 'typeorm';

/**
 * Listado paginado en la BD con el mismo `options` del listado completo.
 * `page` es 1-based; `limit = -1` devuelve todos los registros.
 * Con DTO, el ValidationPipe global ya los convierte a número; también
 * acepta texto por si el valor llega sin pasar por un DTO.
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
