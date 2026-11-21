import { Global, Module } from '@nestjs/common';

import { CacheInvalidationSubscriber } from './cache-invalidation.subscriber.js';
import { CacheService } from './cache.service.js';

/** Caché Redis de catálogos y dashboard (ver CacheService). */
@Global()
@Module({
  providers: [CacheService, CacheInvalidationSubscriber],
  exports: [CacheService],
})
export class CacheModule {}
