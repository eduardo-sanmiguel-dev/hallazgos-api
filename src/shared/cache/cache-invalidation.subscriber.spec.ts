import type { DataSource, QueryRunner } from 'typeorm';

import { Evidence } from '../../evidences/entities/evidence.entity.js';
import { ManufacturingPlant } from '../../manufacturing-plants/entities/manufacturing-plant.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { Zone } from '../../zones/entities/zone.entity.js';
import { CacheInvalidationSubscriber } from './cache-invalidation.subscriber.js';
import type { CacheService } from './cache.service.js';

describe('CacheInvalidationSubscriber', () => {
  let subscriber: CacheInvalidationSubscriber;
  let invalidate: jest.Mock;
  let dataSource: { subscribers: unknown[] };

  const runner = (isTransactionActive: boolean) =>
    ({ isTransactionActive, data: {} }) as unknown as QueryRunner;
  const event = (
    target: unknown,
    queryRunner: QueryRunner,
    tableName?: string,
  ) => ({ metadata: { target, tableName }, queryRunner }) as never;
  const invalidated = () =>
    invalidate.mock.calls.map(([namespaces]) => [...namespaces].sort());

  beforeEach(() => {
    invalidate = jest.fn(async () => undefined);
    dataSource = { subscribers: [] };
    subscriber = new CacheInvalidationSubscriber(
      dataSource as unknown as DataSource,
      { invalidate } as unknown as CacheService,
    );
  });

  it('se registra en el DataSource', () => {
    expect(dataSource.subscribers).toEqual([subscriber]);
  });

  it('fuera de transacción invalida al momento: catálogo → catálogos y dashboard', async () => {
    await subscriber.afterUpdate(event(Zone, runner(false)));

    expect(invalidated()).toEqual([['catalogs', 'dashboard']]);
  });

  // El usuario en sesión (UsersService.findSessionUser) sale del caché.
  it.each([
    ['un usuario (rol, activo, cerrar sesión en todos lados)', User, undefined],
    ['una planta', ManufacturingPlant, undefined],
  ])('%s también invalida las sesiones', async (_, target, tableName) => {
    await subscriber.afterUpdate(event(target, runner(false), tableName));

    expect(invalidated()).toEqual([['catalogs', 'dashboard', 'sessions']]);
  });

  it('asignar o quitar plantas a un usuario invalida las sesiones', async () => {
    await subscriber.afterInsert(
      event('', runner(false), 'user_manufacturing_plants'),
    );
    await subscriber.afterRemove(event('', runner(false), 'user_zones'));

    expect(invalidated()).toEqual([['dashboard', 'sessions'], ['dashboard']]);
  });

  it('cualquier otra entidad solo invalida el dashboard', async () => {
    await subscriber.afterInsert(event(Evidence, runner(false)));
    await subscriber.afterRemove(event(Evidence, runner(false)));
    await subscriber.afterSoftRemove(event(Evidence, runner(false)));
    await subscriber.afterRecover(
      event('evidence_responsibles_user', runner(false)),
    );

    expect(invalidated()).toEqual([
      ['dashboard'],
      ['dashboard'],
      ['dashboard'],
      ['dashboard'],
    ]);
  });

  it('dentro de una transacción espera al COMMIT y junta los espacios', async () => {
    const queryRunner = runner(true);
    await subscriber.afterInsert(event(Evidence, queryRunner));
    await subscriber.afterUpdate(event(Zone, queryRunner));
    expect(invalidate).not.toHaveBeenCalled();

    // Liberar un savepoint: la transacción sigue abierta.
    await subscriber.afterTransactionCommit({ queryRunner } as never);
    expect(invalidate).not.toHaveBeenCalled();

    Object.assign(queryRunner, { isTransactionActive: false });
    await subscriber.afterTransactionCommit({ queryRunner } as never);
    expect(invalidated()).toEqual([['catalogs', 'dashboard']]);

    // Lo pendiente se consumió: otro commit no vuelve a invalidar.
    await subscriber.afterTransactionCommit({ queryRunner } as never);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('un ROLLBACK descarta lo pendiente (un savepoint revertido no)', async () => {
    const queryRunner = runner(true);
    await subscriber.afterInsert(event(Evidence, queryRunner));

    subscriber.afterTransactionRollback({ queryRunner } as never);
    expect(queryRunner.data).toHaveProperty('cacheInvalidation');

    Object.assign(queryRunner, { isTransactionActive: false });
    subscriber.afterTransactionRollback({ queryRunner } as never);
    await subscriber.afterTransactionCommit({ queryRunner } as never);

    expect(queryRunner.data).not.toHaveProperty('cacheInvalidation');
    expect(invalidate).not.toHaveBeenCalled();
  });
});
