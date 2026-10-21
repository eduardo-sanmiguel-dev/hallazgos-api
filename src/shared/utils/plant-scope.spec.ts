import { scopePlantIds } from './plant-scope.js';

describe('scopePlantIds', () => {
  const plants = [{ id: 1 }, { id: '2' }];

  it('sin planta pedida devuelve todas las del usuario (como números)', () => {
    expect(scopePlantIds(plants)).toEqual([1, 2]);
  });

  it.each([
    ['número', 2],
    ['texto', '2'],
  ])('con una planta propia (%s) devuelve solo esa', (_c, requested) => {
    expect(scopePlantIds(plants, requested)).toEqual([2]);
  });

  it('con una planta ajena devuelve vacío', () => {
    expect(scopePlantIds(plants, 3)).toEqual([]);
  });

  it('un usuario sin plantas no puede consultar ninguna', () => {
    expect(scopePlantIds(undefined)).toEqual([]);
    expect(scopePlantIds([], 1)).toEqual([]);
  });
});
