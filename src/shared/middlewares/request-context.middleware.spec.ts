import type { Request, Response } from 'express';

import { RequestContextService } from '../services/request-context.service';
import { RequestContextMiddleware } from './request-context.middleware';

describe('RequestContextMiddleware', () => {
  it('lo que se ejecuta después del middleware ve la petición en el contexto', () => {
    const middleware = new RequestContextMiddleware();
    const context = new RequestContextService();
    const req = { url: '/api/v1/hallazgos' } as Request;
    let seen: Request | undefined;

    middleware.use(req, {} as Response, () => {
      seen = context.request;
    });

    expect(seen).toBe(req);
  });
});
