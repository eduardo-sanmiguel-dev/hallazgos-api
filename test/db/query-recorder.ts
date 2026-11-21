import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner.js';

/**
 * SQL que manda la app mientras corre `work` (la app de test/db corre en el
 * mismo proceso). Sirve para detectar consultas N+1: la misma consulta
 * repetida por cada registro.
 */
export const recordQueries = async (work: () => Promise<unknown>) => {
  const spy = jest.spyOn(PostgresQueryRunner.prototype, 'query');
  try {
    await work();
    return spy.mock.calls.map(([sql]) => String(sql));
  } finally {
    spy.mockRestore();
  }
};

/** Cuántas consultas empiezan con `prefix` (sin distinguir mayúsculas). */
export const countMatching = (queries: string[], pattern: RegExp) =>
  queries.filter((sql) => pattern.test(sql)).length;
