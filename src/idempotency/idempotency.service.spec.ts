import { Logger } from '@nestjs/common';

import {
  createServiceTestingModule,
  type RepositoryMock,
} from '../../test/utils/index.js';
import { IdempotencyKey } from './entities/idempotency-key.entity.js';
import { IdempotencyService } from './idempotency.service.js';

/**
 * Las sentencias SQL se prueban contra PostgreSQL en test/db; aquí, qué
 * responde claim según lo que devuelve la base y qué manda cada método.
 */
describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let keys: RepositoryMock<IdempotencyKey>;

  beforeEach(async () => {
    const testing = await createServiceTestingModule(IdempotencyService, {
      repositories: [IdempotencyKey],
    });
    service = testing.service;
    keys = testing.repository(IdempotencyKey);
  });

  /** Respuestas de la base: primero el INSERT, luego el SELECT. */
  const database = (...results: unknown[][]) => {
    for (const result of results) keys.query.mockResolvedValueOnce(result);
  };
  const stored = (row: object) => ({
    route: 'POST /evidences',
    status: 'processing',
    response: null,
    stale: false,
    ...row,
  });
  const claim = () => service.claim(7, 'clave', 'POST /evidences');

  describe('claim', () => {
    it('una clave nueva queda registrada', async () => {
      database([{ key: 'clave' }]);

      await expect(claim()).resolves.toEqual({ kind: 'new' });
      expect(keys.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT DO NOTHING'),
        [7, 'clave', 'POST /evidences'],
      );
    });

    it('la misma clave en otra ruta no coincide', async () => {
      database([], [stored({ route: 'POST /epps' })]);

      await expect(claim()).resolves.toEqual({ kind: 'mismatch' });
    });

    it('un envío terminado devuelve su respuesta guardada', async () => {
      database([], [stored({ status: 'done', response: { id: 5 } })]);

      await expect(claim()).resolves.toEqual({
        kind: 'done',
        response: { id: 5 },
      });
    });

    it.each([
      ['falló con error del servidor', { status: 'failed' }],
      ['se quedó a medias', { stale: true }],
    ])('un envío que %s queda sin confirmar', async (_c, row) => {
      database([], [stored(row)]);

      await expect(claim()).resolves.toEqual({ kind: 'unconfirmed' });
    });

    it('un envío reciente en curso sigue procesándose', async () => {
      database([], [stored({})]);

      await expect(claim()).resolves.toEqual({ kind: 'processing' });
    });

    it('si la clave se liberó entre el INSERT y el SELECT, vuelve a intentar', async () => {
      database([], [], [{ key: 'clave' }]);

      await expect(claim()).resolves.toEqual({ kind: 'new' });
      expect(keys.query).toHaveBeenCalledTimes(3);
    });

    it('tras dos intentos sin registrarla ni encontrarla, la da por en curso', async () => {
      database([], [], [], []);

      await expect(claim()).resolves.toEqual({ kind: 'processing' });
      expect(keys.query).toHaveBeenCalledTimes(4);
    });
  });

  it('complete guarda el estado HTTP y la respuesta como JSON (null si no hay)', async () => {
    await service.complete(7, 'clave', 201, { id: 5 });
    await service.complete(7, 'otra', 204, undefined);

    expect(keys.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(`SET "status" = 'done'`),
      [7, 'clave', 201, '{"id":5}'],
    );
    expect(keys.query).toHaveBeenNthCalledWith(2, expect.any(String), [
      7,
      'otra',
      204,
      'null',
    ]);
  });

  it('release borra la clave solo si sigue en proceso', async () => {
    await service.release(7, 'clave');

    expect(keys.delete).toHaveBeenCalledWith({
      userId: 7,
      key: 'clave',
      status: 'processing',
    });
  });

  it('markFailed conserva la clave como fallida', async () => {
    await service.markFailed(7, 'clave');

    expect(keys.update).toHaveBeenCalledWith(
      { userId: 7, key: 'clave', status: 'processing' },
      { status: 'failed' },
    );
  });

  describe('purgeExpired', () => {
    it('borra las claves de más de 7 días', async () => {
      await service.purgeExpired();

      expect(keys.query).toHaveBeenCalledWith(
        expect.stringContaining(`interval '7 days'`),
      );
    });

    it.each([
      ['un Error', new Error('BD caída'), 'BD caída'],
      ['otro valor', 'sin conexión', 'sin conexión'],
    ])('si falla con %s solo lo registra', async (_c, failure, message) => {
      const logError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();
      keys.query.mockRejectedValue(failure);

      await expect(service.purgeExpired()).resolves.toBeUndefined();
      expect(logError).toHaveBeenCalledWith(
        `No se pudieron borrar las claves de idempotencia vencidas: ${message}`,
      );
      logError.mockRestore();
    });
  });
});
