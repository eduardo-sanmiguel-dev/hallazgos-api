import type { NextFunction, Request, Response } from 'express';

import { httpCacheHeaders } from './http-cache.middleware.js';

// Cómo se guardan las lecturas de la API: en el navegador del usuario y
// siempre revalidadas con el ETag; las descargas, nunca.

const run = (method: string, path: string) => {
  const res = { setHeader: jest.fn() } as unknown as Response & {
    setHeader: jest.Mock;
  };
  const next = jest.fn() as NextFunction;
  httpCacheHeaders({ method, path } as Request, res, next);
  return { res, next };
};

describe('httpCacheHeaders', () => {
  it.each([
    ['GET', '/api/v1/zones'],
    ['GET', '/api/v1/users/get-information-current-user'],
    ['HEAD', '/api/v1/main-types'],
  ])('%s %s: privada y revalidada con el ETag (no-cache)', (method, path) => {
    const { res, next } = run(method, path);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-cache',
    );
    expect(next).toHaveBeenCalled();
  });

  it.each([
    '/api/v1/evidences/download/xlsx',
    '/api/v1/ciaels/download/excel',
    '/api/v1/epps/download/file/7',
    '/api/v1/extinguisher-inspections/download/file/3',
    '/api/v1/safety-data-files/download',
  ])('las descargas no se guardan: %s', (path) => {
    const { res } = run('GET', path);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store',
    );
  });

  it('no confunde una ruta que solo contiene la palabra', () => {
    const { res } = run('GET', '/api/v1/downloads-report');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-cache',
    );
  });

  it.each(['POST', 'PATCH', 'DELETE'])(
    'las escrituras (%s) no llevan caché',
    (method) => {
      const { res, next } = run(method, '/api/v1/zones');
      expect(res.setHeader).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    },
  );
});
