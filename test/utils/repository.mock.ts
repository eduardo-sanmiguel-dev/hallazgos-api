import type { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';

/** QueryBuilder encadenable: los métodos de armado devuelven el mismo objeto. */
export type QueryBuilderMock = jest.Mocked<SelectQueryBuilder<ObjectLiteral>>;

const CHAINABLE = [
  'select',
  'addSelect',
  'from',
  'where',
  'andWhere',
  'orWhere',
  'leftJoin',
  'leftJoinAndSelect',
  'innerJoin',
  'innerJoinAndSelect',
  'orderBy',
  'addOrderBy',
  'groupBy',
  'addGroupBy',
  'having',
  'skip',
  'take',
  'limit',
  'offset',
  'setParameter',
  'setParameters',
  'withDeleted',
] as const;

const TERMINAL = [
  'getMany',
  'getOne',
  'getManyAndCount',
  'getCount',
  'getRawMany',
  'getRawOne',
  'execute',
] as const;

export const createQueryBuilderMock = (): QueryBuilderMock => {
  const qb: Record<string, jest.Mock> = {};
  for (const method of CHAINABLE) qb[method] = jest.fn().mockReturnValue(qb);
  for (const method of TERMINAL) qb[method] = jest.fn();
  return qb as unknown as QueryBuilderMock;
};

export type RepositoryMock<T extends ObjectLiteral> = jest.Mocked<
  Repository<T>
> & { queryBuilder: QueryBuilderMock };

/**
 * Repositorio de TypeORM simulado. Sin configurar, las lecturas devuelven
 * vacío/null, `create` devuelve el objeto recibido y `save` lo devuelve tal
 * cual (como hace TypeORM con entidades nuevas). Cada test sobrescribe lo que
 * necesite con mockResolvedValue.
 */
export const createRepositoryMock = <
  T extends ObjectLiteral,
>(): RepositoryMock<T> => {
  const queryBuilder = createQueryBuilderMock();
  const repository = {
    find: jest.fn().mockResolvedValue([]),
    findBy: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findOneBy: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    count: jest.fn().mockResolvedValue(0),
    exists: jest.fn().mockResolvedValue(false),
    existsBy: jest.fn().mockResolvedValue(false),
    create: jest.fn((entity) => ({ ...entity })),
    merge: jest.fn((target, ...sources) => Object.assign(target, ...sources)),
    preload: jest.fn().mockResolvedValue(undefined),
    save: jest.fn(async (entity) => entity),
    insert: jest.fn().mockResolvedValue({ identifiers: [], raw: [] }),
    update: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
    delete: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
    softDelete: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
    remove: jest.fn(async (entity) => entity),
    query: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    queryBuilder,
  };
  return repository as unknown as RepositoryMock<T>;
};
