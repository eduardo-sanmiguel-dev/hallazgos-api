import {
  applyDecorators,
  BadRequestException,
  ParseEnumPipe,
} from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';

import { SORT_ORDERS } from '../utils/sort.js';

/** `orderBy` opcional: solo una clave de la lista blanca del listado. */
export const IsSortColumn = (columns: readonly string[]) =>
  applyDecorators(
    IsOptional(),
    IsIn(columns, {
      message: `Columna de orden no válida. Use: ${columns.join(', ')}.`,
    }),
  );

/** `order` opcional: "asc" o "desc". */
export const IsSortOrder = () =>
  applyDecorators(
    IsOptional(),
    IsIn(SORT_ORDERS, {
      message: 'Dirección de orden no válida. Use: asc o desc.',
    }),
  );

const enumOf = (values: readonly string[]) =>
  Object.fromEntries(values.map((value) => [value, value]));

/** Para endpoints con `@Query('orderBy')` suelto (sin DTO). */
export const sortColumnPipe = (columns: readonly string[]) =>
  new ParseEnumPipe(enumOf(columns), {
    optional: true,
    exceptionFactory: () =>
      new BadRequestException(
        `Columna de orden no válida. Use: ${columns.join(', ')}.`,
      ),
  });

/** Para endpoints con `@Query('order')` suelto (sin DTO). */
export const sortOrderPipe = () =>
  new ParseEnumPipe(enumOf(SORT_ORDERS), {
    optional: true,
    exceptionFactory: () =>
      new BadRequestException('Dirección de orden no válida. Use: asc o desc.'),
  });
