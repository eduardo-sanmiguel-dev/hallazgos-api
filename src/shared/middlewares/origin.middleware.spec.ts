import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import {
  FORBIDDEN_ORIGIN_MESSAGE,
  OriginMiddleware,
  originOf,
} from './origin.middleware.js';

const configWith = (frontendUrl?: string) =>
  ({ get: () => frontendUrl }) as unknown as ConfigService;

const requestWith = (
  method: string,
  origin?: string,
  extra: Record<string, string | string[]> = {},
) =>
  ({
    method,
    headers: { ...(origin === undefined ? {} : { origin }), ...extra },
  }) as unknown as Request;

describe('OriginMiddleware', () => {
  const response = {} as Response;
  const middleware = new OriginMiddleware(
    configWith('https://comportarte.com/'),
  );

  const run = (
    method: string,
    origin?: string,
    extra?: Record<string, string | string[]>,
  ) => {
    const next = jest.fn();
    middleware.use(requestWith(method, origin, extra), response, next);
    return next;
  };

  /** Lanza el 403 de origen no permitido sin llamar a next. */
  const expectForbidden = (
    method: string,
    origin?: string,
    extra?: Record<string, string | string[]>,
  ) => {
    const next = jest.fn();
    expect(() =>
      middleware.use(requestWith(method, origin, extra), response, next),
    ).toThrow(ForbiddenException);
    expect(next).not.toHaveBeenCalled();
  };

  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])(
    '%s desde el UI pasa',
    (method) => {
      expect(run(method, 'https://comportarte.com')).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['otro sitio', 'https://sitio-malicioso.example'],
    ['un subdominio distinto al del UI', 'https://evil.comportarte.com'],
    ['http en lugar de https', 'http://comportarte.com'],
    ['otro puerto', 'https://comportarte.com:8443'],
    ['Origin null (iframe aislado o redirección)', 'null'],
  ])('rechaza con 403 un POST desde %s', (_case, origin) => {
    const next = jest.fn();
    let error: unknown;
    try {
      middleware.use(requestWith('POST', origin), response, next);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toEqual({
      message: FORBIDDEN_ORIGIN_MESSAGE,
      code: 'FORBIDDEN_ORIGIN',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('los métodos que no cambian datos pasan desde cualquier origen (CORS decide si se leen)', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) {
      expect(run(method, 'https://sitio-malicioso.example')).toHaveBeenCalled();
    }
  });

  it('sin Origin (curl, scripts) pasa: no viajan con la cookie de la víctima', () => {
    expect(run('POST')).toHaveBeenCalledTimes(1);
  });

  it('sin FRONTEND_URL usa el UI local', () => {
    const local = new OriginMiddleware(configWith(undefined));
    const next = jest.fn();

    local.use(requestWith('POST', 'http://localhost:3000'), response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('originOf normaliza la URL y devuelve vacío si no es válida', () => {
    expect(originOf('https://comportarte.com/ruta?x=1')).toBe(
      'https://comportarte.com',
    );
    expect(originOf('www.comportarte.com')).toBe('');
    expect(originOf(undefined)).toBe('');
  });

  describe('Fetch Metadata (Sec-Fetch-Site)', () => {
    const fromSite = (site: string, mode = 'cors') => ({
      'sec-fetch-site': site,
      'sec-fetch-mode': mode,
    });

    it('una escritura sin Origin que el navegador marca de otro sitio se rechaza', () => {
      expectForbidden('POST', undefined, fromSite('cross-site', 'no-cors'));
      // Otro subdominio de comportarte.com: mismo sitio, pero no es el UI.
      expectForbidden('DELETE', undefined, fromSite('same-site'));
    });

    it('otro sitio no puede usar el API como recurso (imagen, script, fetch)', () => {
      for (const mode of ['no-cors', 'cors'])
        expectForbidden('GET', undefined, fromSite('cross-site', mode));
    });

    it('otro sitio sí puede navegar al API (sin cookie, por SameSite=Strict)', () => {
      expect(
        run('GET', undefined, fromSite('cross-site', 'navigate')),
      ).toHaveBeenCalledTimes(1);
    });

    it('el UI pasa: lecturas e imágenes del mismo sitio y escrituras con su Origin', () => {
      expect(
        run('GET', undefined, fromSite('same-site', 'no-cors')),
      ).toHaveBeenCalledTimes(1);
      expect(
        run('POST', 'https://comportarte.com', fromSite('same-site')),
      ).toHaveBeenCalledTimes(1);
      // Si el UI y el API compartieran origen, o el UI fuera de otro sitio.
      expect(
        run('PATCH', 'https://comportarte.com', fromSite('cross-site')),
      ).toHaveBeenCalledTimes(1);
      expect(
        run('POST', undefined, fromSite('same-origin')),
      ).toHaveBeenCalledTimes(1);
    });

    it('una cabecera repetida se toma por su primer valor', () => {
      expectForbidden('POST', undefined, {
        'sec-fetch-site': ['cross-site', 'same-origin'],
      });
    });
  });
});
