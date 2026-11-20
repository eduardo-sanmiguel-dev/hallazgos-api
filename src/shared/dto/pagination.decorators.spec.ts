import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import {
  DEFAULT_PAGE_LIMIT,
  IsPageLimit,
  MAX_PAGE_LIMIT,
  PageLimitPipe,
  withDefaultPage,
} from './pagination.decorators.js';

// Paginación de los listados: de 1 a 100 por página (-1 = todos solo en
// catálogos chicos) y, por HTTP, siempre paginado.

class ListQuery {
  @IsPageLimit()
  limit?: number;
}

class CatalogQuery {
  @IsPageLimit({ allowAll: true })
  limit?: number;
}

const errorsOf = (cls: new () => object, limit: unknown) =>
  validateSync(plainToInstance(cls, { limit })).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );

describe('IsPageLimit', () => {
  it('el tope es 100', () => {
    expect(MAX_PAGE_LIMIT).toBe(100);
  });

  it.each([undefined, 1, 10, 50, 100])('un listado acepta %s', (limit) => {
    expect(errorsOf(ListQuery, limit)).toEqual([]);
  });

  it.each([0, -1, 101, 100000])('un listado rechaza %s', (limit) => {
    expect(errorsOf(ListQuery, limit)).toContain('Debe ser de 1 a 100.');
  });

  it('un listado rechaza un número no entero', () => {
    expect(errorsOf(ListQuery, 2.5)).toHaveLength(1);
  });

  it.each([undefined, -1, 1, 100])('un catálogo chico acepta %s', (limit) => {
    expect(errorsOf(CatalogQuery, limit)).toEqual([]);
  });

  it.each([0, -2, 101])('un catálogo chico rechaza %s', (limit) => {
    expect(errorsOf(CatalogQuery, limit)).toContain(
      'Debe ser de 1 a 100, o -1 para todos.',
    );
  });
});

describe('PageLimitPipe', () => {
  it.each([undefined, ''])('sin valor (%p) no pagina', (value) => {
    expect(new PageLimitPipe().transform(value)).toBeUndefined();
  });

  it('convierte el texto a número', () => {
    expect(new PageLimitPipe().transform('25')).toBe(25);
  });

  it.each(['0', '-1', '101', 'diez', '2.5'])('rechaza %s', (value) => {
    expect(() => new PageLimitPipe().transform(value)).toThrow(
      new BadRequestException('Registros por página: debe ser de 1 a 100.'),
    );
  });

  it('con allowAll acepta -1 y sigue rechazando de más', () => {
    const pipe = new PageLimitPipe(true);
    expect(pipe.transform('-1')).toBe(-1);
    expect(() => pipe.transform('101')).toThrow(
      new BadRequestException(
        'Registros por página: debe ser de 1 a 100, o -1 para todos.',
      ),
    );
  });
});

describe('withDefaultPage', () => {
  it('sin page ni limit, la primera página', () => {
    const query: { name: string; page?: number; limit?: number } = {
      name: 'x',
    };
    expect(withDefaultPage(query)).toEqual({
      name: 'x',
      page: 1,
      limit: DEFAULT_PAGE_LIMIT,
    });
  });

  it('respeta lo que se pidió', () => {
    expect(withDefaultPage({ page: 3, limit: 50 })).toEqual({
      page: 3,
      limit: 50,
    });
  });
});
