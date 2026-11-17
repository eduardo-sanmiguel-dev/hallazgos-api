import type { FindOptionsOrder } from 'typeorm';

/**
 * Ordenamiento de listados en la BD.
 *
 * Cada módulo declara una lista blanca `columna pública → ruta` (p. ej.
 * `{ plant: 'manufacturingPlant.name' }`): el cliente solo elige una clave
 * de esa lista, nunca una columna ni SQL. La ruta es la propiedad de la
 * entidad (find options) o `alias.propiedad` (query builder).
 */

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];
export type SortDirection = 'ASC' | 'DESC';

export type SortColumns<K extends string = string> = Readonly<
  Record<K, string>
>;

export interface SortQuery {
  orderBy?: string;
  order?: string;
}

export interface SortDefault<K extends string> {
  orderBy: K;
  order: SortOrder;
}

export interface ResolvedSort<K extends string> {
  /** Clave pública aplicada (la pedida o la predeterminada). */
  orderBy: K;
  order: SortOrder;
  /** Ruta de la lista blanca para esa clave. */
  path: string;
  direction: SortDirection;
}

/** Claves públicas de una lista blanca, para `@IsSortColumn`. */
export const sortKeys = <K extends string>(columns: SortColumns<K>) =>
  Object.keys(columns) as K[];

const isSortOrder = (value: unknown): value is SortOrder =>
  value === 'asc' || value === 'desc';

/**
 * Orden efectivo: la columna pedida si está en la lista blanca; si no, la
 * predeterminada del listado. Sin `order` (o inválido) la columna pedida va
 * ascendente; la predeterminada conserva su dirección.
 */
export function resolveSort<K extends string>(
  columns: SortColumns<K>,
  { orderBy, order }: SortQuery,
  fallback: SortDefault<NoInfer<K>>,
): ResolvedSort<K> {
  const requested =
    typeof orderBy === 'string' && Object.hasOwn(columns, orderBy)
      ? (orderBy as K)
      : undefined;
  const key = requested ?? fallback.orderBy;
  const direction: SortOrder = isSortOrder(order)
    ? order
    : requested
      ? 'asc'
      : fallback.order;

  return {
    orderBy: key,
    order: direction,
    path: columns[key],
    direction: direction === 'desc' ? 'DESC' : 'ASC',
  };
}

/**
 * `order` de find options: `'manufacturingPlant.name'` →
 * `{ manufacturingPlant: { name: { direction, nulls: 'LAST' } } }`, más el
 * desempate por id (estable entre páginas: una fila no salta de página).
 * Los vacíos van al final en ambas direcciones: primero lo que tiene dato.
 */
export function buildFindOrder<K extends string, T = any>(
  columns: SortColumns<K>,
  query: SortQuery,
  fallback: SortDefault<NoInfer<K>>,
  tieBreaker = 'id',
): FindOptionsOrder<T> {
  const { path, direction } = resolveSort(columns, query, fallback);
  const order: Record<string, unknown> = {};

  const assign = (target: Record<string, unknown>, segments: string[]) => {
    const [head, ...rest] = segments;
    if (!rest.length) {
      target[head] = { direction, nulls: 'LAST' };
      return;
    }
    const child = (target[head] as Record<string, unknown>) ?? {};
    target[head] = child;
    assign(child, rest);
  };

  // El desempate (id) nunca es nulo: basta la dirección.
  if (path === tieBreaker) {
    order[tieBreaker] = direction;
  } else {
    assign(order, path.split('.'));
    order[tieBreaker] = direction;
  }

  return order as FindOptionsOrder<T>;
}

/**
 * Para query builder: aplica el orden (vacíos al final) y el desempate por
 * `${alias}.id` en la misma dirección.
 */
export function applyQueryBuilderSort<K extends string>(
  qb: {
    orderBy(
      sort: string,
      order?: SortDirection,
      nulls?: 'NULLS FIRST' | 'NULLS LAST',
    ): unknown;
    addOrderBy(
      sort: string,
      order?: SortDirection,
      nulls?: 'NULLS FIRST' | 'NULLS LAST',
    ): unknown;
  },
  columns: SortColumns<K>,
  query: SortQuery,
  fallback: SortDefault<NoInfer<K>>,
  tieBreaker: string,
): ResolvedSort<K> {
  const sort = resolveSort(columns, query, fallback);
  qb.orderBy(sort.path, sort.direction, 'NULLS LAST');
  if (sort.path !== tieBreaker) {
    qb.addOrderBy(tieBreaker, sort.direction);
  }
  return sort;
}
