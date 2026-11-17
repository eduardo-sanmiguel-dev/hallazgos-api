import {
  ForbiddenException,
  Injectable,
  type NestMiddleware,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { NextFunction, Request, Response } from 'express';

import { apiError, ERROR_CODES } from '../errors/error-codes.js';

// Métodos que no cambian datos: no los puede aprovechar un CSRF.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const FORBIDDEN_ORIGIN_MESSAGE =
  'La petición viene de un sitio no permitido.';

/** Origen (esquema + dominio + puerto) de una URL; vacío si no es válida. */
export const originOf = (url: string | undefined): string => {
  try {
    return new URL(url ?? '').origin;
  } catch {
    return '';
  }
};

/**
 * Protección CSRF (segunda capa; la primera es la cookie SameSite=Lax): una
 * petición que cambia datos solo se acepta si el navegador dice que viene
 * del UI (`FRONTEND_URL`, el mismo origen que permite CORS).
 *
 * Los navegadores siempre mandan `Origin` en un POST/PATCH/DELETE hecho
 * desde otro sitio (formulario oculto, fetch), así que un ataque desde una
 * página ajena llega con su origen y se rechaza con 403. Sin `Origin` (curl,
 * scripts, pruebas) se deja pasar: no viajan con la cookie de la víctima.
 * `Origin: null` (iframes aislados, redirecciones) se rechaza.
 *
 * Reemplaza a la cabecera `x-app-key`, cuya clave iba en el JavaScript del UI
 * (no era secreta) y solo protegía de CSRF por ser una cabecera propia.
 */
@Injectable()
export class OriginMiddleware implements NestMiddleware {
  private readonly allowedOrigin: string;

  constructor(configService: ConfigService) {
    this.allowedOrigin = originOf(
      configService.get<string>('frontendUrl') || 'http://localhost:3000',
    );
  }

  use(req: Request, _res: Response, next: NextFunction) {
    const origin = req.headers.origin;

    if (
      SAFE_METHODS.has(req.method.toUpperCase()) ||
      origin === undefined ||
      origin === this.allowedOrigin
    ) {
      next();
      return;
    }

    throw new ForbiddenException(
      apiError(FORBIDDEN_ORIGIN_MESSAGE, ERROR_CODES.forbiddenOrigin),
    );
  }
}
