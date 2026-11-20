import {
  applyDecorators,
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { IsInt, IsOptional, Max, Min, NotEquals } from 'class-validator';

/**
 * Máximo de registros por página. La UI ofrece 10, 25 y 50; antes no había
 * tope y `limit=100000` (o -1) armaba respuestas de decenas de MB (todos los
 * hallazgos: 14 MB; todas las entregas de EPP con sus firmas: 44 MB).
 */
export const MAX_PAGE_LIMIT = 100;

/** Registros de la página que responde un listado que no la pidió. */
export const DEFAULT_PAGE_LIMIT = 10;

// Junto al campo (el filtro antepone "Registros por página").
const LIMIT_MESSAGE = `Debe ser de 1 a ${MAX_PAGE_LIMIT}.`;
const LIMIT_OR_ALL_MESSAGE = `Debe ser de 1 a ${MAX_PAGE_LIMIT}, o -1 para todos.`;

/**
 * `limit` de un listado: de 1 a 100. Con `allowAll`, también -1 ("Todos"):
 * solo en catálogos chicos de administración (zonas, procesos, plantas…).
 */
export const IsPageLimit = ({ allowAll = false } = {}) =>
  allowAll
    ? applyDecorators(
        IsOptional(),
        IsInt(),
        Min(-1, { message: LIMIT_OR_ALL_MESSAGE }),
        NotEquals(0, { message: LIMIT_OR_ALL_MESSAGE }),
        Max(MAX_PAGE_LIMIT, { message: LIMIT_OR_ALL_MESSAGE }),
      )
    : applyDecorators(
        IsOptional(),
        IsInt(),
        Min(1, { message: LIMIT_MESSAGE }),
        Max(MAX_PAGE_LIMIT, { message: LIMIT_MESSAGE }),
      );

/**
 * Los listados grandes siempre responden paginados por HTTP: sin `page` o
 * `limit`, la primera página ({ data, count }). Antes respondían todos los
 * registros. Los servicios conservan el listado completo para las descargas.
 */
export const withDefaultPage = <T extends { page?: number; limit?: number }>(
  query: T,
): T => ({
  ...query,
  page: query.page ?? 1,
  limit: query.limit ?? DEFAULT_PAGE_LIMIT,
});

/**
 * `limit` suelto (`@Query('limit')`, sin DTO): la misma regla que
 * IsPageLimit. Sin valor, undefined.
 */
@Injectable()
export class PageLimitPipe implements PipeTransform {
  constructor(private readonly allowAll = false) {}

  transform(value?: string) {
    if (value === undefined || value === '') return undefined;
    const limit = Number(value);
    const valid =
      Number.isInteger(limit) &&
      limit <= MAX_PAGE_LIMIT &&
      (limit >= 1 || (this.allowAll && limit === -1));
    if (!valid)
      throw new BadRequestException(
        `Registros por página: ${(this.allowAll ? LIMIT_OR_ALL_MESSAGE : LIMIT_MESSAGE).toLowerCase()}`,
      );
    return limit;
  }
}
