import type { FindManyOptions, ObjectLiteral, Repository } from 'typeorm';

export interface FindPaginatedOptions {
  /**
   * Contar solo con `where`, sin las `relations` del listado. `findAndCount`
   * repite en el conteo todas las relaciones a cargar; con colecciones
   * (supervisores, responsables, comentarios) eso multiplica las filas y
   * Postgres tarda más en planear y contar que en traer la página. Contando
   * solo con `where`, TypeORM une únicamente las relaciones que filtran, y el
   * total es el mismo (`COUNT(DISTINCT id)` con los mismos filtros).
   */
  countWithoutRelations?: boolean;
}

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
  { countWithoutRelations = false }: FindPaginatedOptions = {},
) {
  const pageNumber = Math.max(1, Number(page) || 1);
  const limitNumber = Number(limit);
  const pageOptions: FindManyOptions<T> = {
    ...options,
    ...(limitNumber > 0 && {
      take: limitNumber,
      skip: (pageNumber - 1) * limitNumber,
    }),
  };

  if (!countWithoutRelations) {
    const [data, count] = await repository.findAndCount(pageOptions);
    return { data, count };
  }

  // Una tras otra (como findAndCount): sin total no se busca la página.
  const count = await repository.count({ where: options.where });
  const data = count ? await repository.find(pageOptions) : [];
  return { data, count };
}
