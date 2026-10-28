import {
  BadRequestException,
  type CallHandler,
  ConflictException,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  type NestInterceptor,
  SetMetadata,
  UnprocessableEntityException,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { from, mergeMap, type Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { QueryFailedError } from 'typeorm';

import { apiError, ERROR_CODES } from '../shared/errors/error-codes.js';
import { IdempotencyService } from './idempotency.service.js';

const IDEMPOTENT = 'idempotent';
export const IDEMPOTENCY_HEADER = 'idempotency-key';
/** En la respuesta de un reintento que ya se había procesado. */
export const REPLAYED_HEADER = 'Idempotent-Replayed';

/**
 * Marca un endpoint que crea registros o manda correos: con el header
 * Idempotency-Key, un reintento con la misma clave devuelve la respuesta del
 * primer envío sin volver a ejecutarlo. Sin el header funciona como siempre.
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT, true);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const IDEMPOTENCY_MESSAGES = {
  inProgress:
    'Tu envío anterior todavía se está procesando. Espera unos segundos.',
  unconfirmed:
    'No pudimos confirmar si tu envío anterior se guardó. Revisa la lista antes de capturarlo de nuevo.',
  mismatch: 'La clave de envío ya se usó en otra operación.',
  invalid: 'La clave de envío no es válida.',
};

/**
 * Espera a que termine de llegar el cuerpo sin procesarlo. Un reintento que
 * ya está resuelto responde sin leer la foto; si se respondiera mientras el
 * navegador sigue subiéndola, Node podría cerrar la conexión y el navegador
 * vería un error de red en lugar de la respuesta.
 */
export const drainRequest = (req: Request) =>
  req.readableEnded
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        req.once('end', resolve);
        req.once('close', resolve);
        req.once('error', () => resolve());
        req.resume();
      });

/** Estatus con el que terminaría el error (4xx: no se guardó nada). */
const statusOf = (error: unknown) => {
  if (error instanceof HttpException) return error.getStatus();
  if (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string })?.code === '23505'
  ) {
    return HttpStatus.CONFLICT;
  }
  return HttpStatus.INTERNAL_SERVER_ERROR;
};

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly idempotency: IdempotencyService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();
    if (!this.reflector.get<boolean>(IDEMPOTENT, context.getHandler())) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers[IDEMPOTENCY_HEADER];
    const userId = (req.user as { id?: number } | undefined)?.id;

    // Sin header (UI anterior) o sin sesión (lo rechaza el middleware JWT).
    if (!header || !userId) return next.handle();

    const key = String(header);
    if (!UUID.test(key)) {
      await drainRequest(req);
      throw new BadRequestException(
        apiError(IDEMPOTENCY_MESSAGES.invalid, ERROR_CODES.badRequest),
      );
    }

    const route = `${req.method} ${req.originalUrl.split('?')[0]}`;
    const claim = await this.idempotency.claim(userId, key, route);

    if (claim.kind !== 'new') {
      await drainRequest(req);
    }

    switch (claim.kind) {
      case 'done':
        // Misma respuesta y mismo estatus (el del endpoint) que el primero.
        // El header avisa a la UI que ya se había guardado antes (borrador
        // reenviado, reintento tras un corte).
        context
          .switchToHttp()
          .getResponse<Response>()
          .setHeader(REPLAYED_HEADER, 'true');
        return of(claim.response);
      case 'processing':
        throw new ConflictException(
          apiError(
            IDEMPOTENCY_MESSAGES.inProgress,
            ERROR_CODES.idempotencyInProgress,
          ),
        );
      case 'unconfirmed':
        throw new ConflictException(
          apiError(
            IDEMPOTENCY_MESSAGES.unconfirmed,
            ERROR_CODES.idempotencyUnconfirmed,
          ),
        );
      case 'mismatch':
        throw new UnprocessableEntityException(
          apiError(
            IDEMPOTENCY_MESSAGES.mismatch,
            ERROR_CODES.idempotencyKeyMismatch,
          ),
        );
    }

    const httpStatus =
      this.reflector.get<number>(HTTP_CODE_METADATA, context.getHandler()) ??
      (req.method === 'POST' ? HttpStatus.CREATED : HttpStatus.OK);

    return next.handle().pipe(
      mergeMap((body) =>
        from(
          this.idempotency
            .complete(userId, key, httpStatus, body)
            // Ya se guardó: si falla marcar la clave, se responde igual. Un
            // reintento la verá "sin confirmar" en lugar de duplicar.
            .catch((error) =>
              this.logger.error(
                `No se pudo marcar la clave ${key} (${route}) como terminada: ${(error as Error)?.message ?? error}`,
              ),
            )
            .then(() => body),
        ),
      ),
      catchError((error: unknown) =>
        from(
          (statusOf(error) < 500
            ? this.idempotency.release(userId, key)
            : this.idempotency.markFailed(userId, key)
          )
            .catch((cleanupError) =>
              this.logger.error(
                `No se pudo actualizar la clave ${key} (${route}) tras un error: ${(cleanupError as Error)?.message ?? cleanupError}`,
              ),
            )
            .then(() => {
              throw error;
            }),
        ),
      ),
    );
  }
}
