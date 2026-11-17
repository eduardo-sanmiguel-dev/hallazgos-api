import {
  applyQueryBuilderSort,
  buildFindOrder,
  resolveSort,
  sortKeys,
} from './sort.js';

const COLUMNS = {
  id: 'id',
  name: 'name',
  plant: 'manufacturingPlant.name',
} as const;

const DEFAULT = { orderBy: 'id', order: 'desc' } as const;

describe('resolveSort', () => {
  it('sin parámetros usa el orden predeterminado', () => {
    expect(resolveSort(COLUMNS, {}, DEFAULT)).toEqual({
      orderBy: 'id',
      order: 'desc',
      path: 'id',
      direction: 'DESC',
    });
  });

  it('aplica la columna y dirección pedidas', () => {
    expect(
      resolveSort(COLUMNS, { orderBy: 'plant', order: 'desc' }, DEFAULT),
    ).toEqual({
      orderBy: 'plant',
      order: 'desc',
      path: 'manufacturingPlant.name',
      direction: 'DESC',
    });
  });

  it('columna pedida sin dirección va ascendente', () => {
    expect(resolveSort(COLUMNS, { orderBy: 'name' }, DEFAULT).direction).toBe(
      'ASC',
    );
  });

  it('ignora columnas fuera de la lista blanca (sin SQL del cliente)', () => {
    for (const orderBy of [
      'password',
      'name; DROP TABLE users',
      'toString',
      '__proto__',
    ]) {
      expect(resolveSort(COLUMNS, { orderBy }, DEFAULT).path).toBe('id');
    }
  });

  it('dirección inválida: la predeterminada conserva la suya', () => {
    expect(resolveSort(COLUMNS, { order: 'up' }, DEFAULT).direction).toBe(
      'DESC',
    );
  });
});

describe('buildFindOrder', () => {
  it('anida rutas de relaciones, vacíos al final y desempate por id', () => {
    expect(
      buildFindOrder(COLUMNS, { orderBy: 'plant', order: 'asc' }, DEFAULT),
    ).toEqual({
      manufacturingPlant: { name: { direction: 'ASC', nulls: 'LAST' } },
      id: 'ASC',
    });
  });

  it('ordenar por id no repite el desempate', () => {
    expect(buildFindOrder(COLUMNS, {}, DEFAULT)).toEqual({ id: 'DESC' });
  });

  it('acepta otra columna de desempate', () => {
    expect(
      buildFindOrder(
        COLUMNS,
        { orderBy: 'name', order: 'desc' },
        DEFAULT,
        'code',
      ),
    ).toEqual({ name: { direction: 'DESC', nulls: 'LAST' }, code: 'DESC' });
  });
});

describe('applyQueryBuilderSort', () => {
  const makeQb = () => ({ orderBy: jest.fn(), addOrderBy: jest.fn() });

  it('ordena con vacíos al final y desempata por el id del alias', () => {
    const qb = makeQb();
    const sort = applyQueryBuilderSort(
      qb,
      { name: 'zone.name', id: 'zone.id' },
      { orderBy: 'name', order: 'desc' },
      { orderBy: 'id', order: 'desc' },
      'zone.id',
    );

    expect(qb.orderBy).toHaveBeenCalledWith('zone.name', 'DESC', 'NULLS LAST');
    expect(qb.addOrderBy).toHaveBeenCalledWith('zone.id', 'DESC');
    expect(sort.orderBy).toBe('name');
  });

  it('sin desempate cuando ya ordena por la misma columna', () => {
    const qb = makeQb();
    applyQueryBuilderSort(
      qb,
      { id: 'zone.id' },
      {},
      { orderBy: 'id', order: 'asc' },
      'zone.id',
    );

    expect(qb.orderBy).toHaveBeenCalledWith('zone.id', 'ASC', 'NULLS LAST');
    expect(qb.addOrderBy).not.toHaveBeenCalled();
  });
});

describe('sortKeys', () => {
  it('devuelve las claves públicas', () => {
    expect(sortKeys(COLUMNS)).toEqual(['id', 'name', 'plant']);
  });
});
