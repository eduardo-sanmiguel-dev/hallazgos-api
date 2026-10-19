import { Injectable, NestMiddleware } from '@nestjs/common';

import type { Request, Response, NextFunction } from 'express';

import { RequestContextService } from '../services/request-context.service';

// Abre el contexto de la petición; debe ir antes que los demás middlewares.
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    RequestContextService.run(req, next);
  }
}
