import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IdempotencyKey } from './entities/idempotency-key.entity.js';
import { IdempotencyInterceptor } from './idempotency.interceptor.js';
import { IdempotencyService } from './idempotency.service.js';

/**
 * Interceptor global: solo actúa en los endpoints marcados con @Idempotent().
 * Al ser global corre antes que el FileInterceptor de la ruta, así que un
 * reintento ya resuelto no vuelve a guardar la foto en disco.
 */
@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyKey])],
  providers: [
    IdempotencyService,
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
