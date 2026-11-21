import { Injectable } from '@nestjs/common';
import {
  DataSource,
  type EntitySubscriberInterface,
  type InsertEvent,
  type QueryRunner,
  type RecoverEvent,
  type RemoveEvent,
  type SoftRemoveEvent,
  type TransactionCommitEvent,
  type TransactionRollbackEvent,
  type UpdateEvent,
} from 'typeorm';

import { Area } from '../../areas/entities/area.entity.js';
import { Country } from '../../countries/entities/country.entity.js';
import { MainType } from '../../main-types/entities/main-type.entity.js';
import { ManufacturingPlant } from '../../manufacturing-plants/entities/manufacturing-plant.entity.js';
import { Processes } from '../../processes/entities/processes.entity.js';
import { SecondaryType } from '../../secondary-types/entities/secondary-type.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { Zone } from '../../zones/entities/zone.entity.js';
import { CacheService, type CacheNamespace } from './cache.service.js';

/**
 * Entidades que aparecen en las respuestas de catálogos (las zonas traen
 * planta, área y quién las creó o editó).
 */
const CATALOG_ENTITIES = new Set<unknown>([
  MainType,
  SecondaryType,
  Zone,
  Area,
  Processes,
  ManufacturingPlant,
  Country,
  User,
]);

const PENDING = 'cacheInvalidation';

type Event = { metadata: { target: unknown }; queryRunner: QueryRunner };

/**
 * Invalida el caché en cada escritura de TypeORM (save, update, delete,
 * relaciones ManyToMany). El dashboard depende de casi todo (hallazgos,
 * usuarios, catálogos): cualquier escritura lo invalida; las escrituras son
 * pocas (decenas al día). En SQL crudo solo se escriben idempotencia y
 * correos, que no salen en estas respuestas.
 *
 * Dentro de una transacción espera al COMMIT: invalidar antes dejaría que una
 * lectura concurrente guarde datos viejos bajo la generación nueva. Un
 * ROLLBACK la descarta.
 */
@Injectable()
export class CacheInvalidationSubscriber implements EntitySubscriberInterface {
  constructor(
    dataSource: DataSource,
    private readonly cache: CacheService,
  ) {
    dataSource.subscribers.push(this);
  }

  afterInsert(event: InsertEvent<unknown>) {
    return this.changed(event);
  }

  afterUpdate(event: UpdateEvent<unknown>) {
    return this.changed(event);
  }

  afterRemove(event: RemoveEvent<unknown>) {
    return this.changed(event);
  }

  afterSoftRemove(event: SoftRemoveEvent<unknown>) {
    return this.changed(event);
  }

  afterRecover(event: RecoverEvent<unknown>) {
    return this.changed(event);
  }

  afterTransactionCommit({ queryRunner }: TransactionCommitEvent) {
    // Al liberar un savepoint la transacción sigue abierta.
    if (queryRunner.isTransactionActive) return;
    const pending = this.take(queryRunner);
    return pending && this.cache.invalidate(pending);
  }

  afterTransactionRollback({ queryRunner }: TransactionRollbackEvent) {
    if (!queryRunner.isTransactionActive) this.take(queryRunner);
  }

  private changed({ metadata, queryRunner }: Event) {
    const namespaces: CacheNamespace[] = CATALOG_ENTITIES.has(metadata.target)
      ? ['catalogs', 'dashboard']
      : ['dashboard'];
    if (!queryRunner.isTransactionActive)
      return this.cache.invalidate(namespaces);
    const pending: Set<CacheNamespace> = (queryRunner.data[PENDING] ??=
      new Set());
    for (const namespace of namespaces) pending.add(namespace);
  }

  private take(queryRunner: QueryRunner): Set<CacheNamespace> | undefined {
    const pending = queryRunner.data[PENDING];
    delete queryRunner.data[PENDING];
    return pending;
  }
}
