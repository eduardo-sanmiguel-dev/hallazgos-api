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

const header = (req: Request, name: string) => {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

/**
 * Protección CSRF. Capas, de afuera hacia adentro:
 *
 * 1. Cookie de sesión `SameSite=Strict` (auth.service): el navegador no la
 *    manda en nada que empiece en otro sitio, ni siquiera al seguir un
 *    enlace. El UI (comportarte.com) y el API (api.comportarte.com) son el
 *    mismo sitio, así que a la app no le afecta.
 * 2. `Origin`: una petición que cambia datos solo se acepta si el navegador
 *    dice que viene del UI (`FRONTEND_URL`, el mismo origen que permite
 *    CORS). Los navegadores siempre lo mandan en un POST/PATCH/DELETE hecho
 *    desde otra página. `Origin: null` (iframes aislados, redirecciones) se
 *    rechaza.
 * 3. Fetch Metadata (`Sec-Fetch-Site`, en todos los navegadores actuales):
 *    sin `Origin`, una escritura que el navegador marca como de otro origen
 *    también se rechaza; y otro sitio no puede usar el API como recurso
 *    (imagen, script, fetch): solo navegar a él, sin cookie por la capa 1.
 *
 * Sin `Origin` ni `Sec-Fetch-Site` (curl, scripts, monitoreo) se deja pasar:
 * no son el navegador de la víctima y no llevan su cookie. Con estas capas
 * no hace falta un token anti-CSRF aparte.
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
    const origin = header(req, 'origin');
    const site = header(req, 'sec-fetch-site');
    const safe = SAFE_METHODS.has(req.method.toUpperCase());
    const fromUi = origin === this.allowedOrigin;

    // Otro sitio solo puede navegar al API (abrir un enlace), nunca usarlo
    // como recurso de su página.
    const crossSiteResource =
      site === 'cross-site' &&
      !fromUi &&
      !(safe && header(req, 'sec-fetch-mode') === 'navigate');

    // Escrituras: del UI, o sin rastro de venir de un navegador en otra
    // página (curl, scripts).
    const foreignWrite =
      !safe &&
      !fromUi &&
      (origin !== undefined ||
        (site !== undefined && site !== 'same-origin' && site !== 'none'));

    if (!crossSiteResource && !foreignWrite) {
      next();
      return;
    }

    throw new ForbiddenException(
      apiError(FORBIDDEN_ORIGIN_MESSAGE, ERROR_CODES.forbiddenOrigin),
    );
  }
}
