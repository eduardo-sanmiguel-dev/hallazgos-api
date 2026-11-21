import type { Repository } from 'typeorm';

import { findPaginated } from './paginate.js';

describe('findPaginated', () => {
  const findAndCount = jest.fn().mockResolvedValue([[{ id: 1 }], 12]);
  const repository = { findAndCount } as unknown as Repository<{ id: number }>;

  beforeEach(() => findAndCount.mockClear());

  it('calcula skip/take a partir de page (1-based) y limit', async () => {
    const result = await findPaginated(
      repository,
      { order: { id: 'DESC' } },
      '3',
      '5',
    );

    expect(findAndCount).toHaveBeenCalledWith({
      order: { id: 'DESC' },
      take: 5,
      skip: 10,
    });
    expect(result).toEqual({ data: [{ id: 1 }], count: 12 });
  });

  it('limit -1 devuelve todos (sin take/skip)', async () => {
    await findPaginated(repository, {}, 1, -1);

    expect(findAndCount).toHaveBeenCalledWith({});
  });

  it('page inválida se trata como la primera', async () => {
    await findPaginated(repository, {}, 'abc', 10);

    expect(findAndCount).toHaveBeenCalledWith({ take: 10, skip: 0 });
  });

  describe('countWithoutRelations', () => {
    const count = jest.fn();
    const find = jest.fn().mockResolvedValue([{ id: 1 }]);
    const light = {
      findAndCount,
      count,
      find,
    } as unknown as Repository<{ id: number }>;
    const options = {
      where: { id: 1 },
      relations: ['comments'],
      order: { id: 'DESC' as const },
    };

    beforeEach(() => {
      count.mockReset().mockResolvedValue(12);
      find.mockClear();
    });

    it('cuenta solo con where y trae la página con todas las opciones', async () => {
      const result = await findPaginated(light, options, 2, 5, {
        countWithoutRelations: true,
      });

      expect(count).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(find).toHaveBeenCalledWith({ ...options, take: 5, skip: 5 });
      expect(findAndCount).not.toHaveBeenCalled();
      expect(result).toEqual({ data: [{ id: 1 }], count: 12 });
    });

    it('sin resultados no busca la página', async () => {
      count.mockResolvedValue(0);

      await expect(
        findPaginated(light, options, 1, 10, { countWithoutRelations: true }),
      ).resolves.toEqual({ data: [], count: 0 });
      expect(find).not.toHaveBeenCalled();
    });
  });
});
