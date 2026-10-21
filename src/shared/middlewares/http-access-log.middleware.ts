import type { NextFunction, Request, Response } from 'express';

import type { OpenObserveLogger } from '../services/openobserve-logger.js';

// El monitoreo consulta el health check a cada rato: no aporta al log.
const SKIPPED_PATHS = new Set(['/api/v1/health']);

/**
 * Registra cada petición HTTP en OpenObserve (método, ruta, status,
 * duración). La ruta va sin query string: puede llevar tokens.
 */
export const httpAccessLog =
  (logger: Pick<OpenObserveLogger, 'ship'>) =>
  (req: Request, res: Response, next: NextFunction) => {
    const path = req.originalUrl.split('?')[0];
    if (SKIPPED_PATHS.has(path)) return next();

    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const status = res.statusCode;
      const durationMs = Math.round(
        Number(process.hrtime.bigint() - start) / 1e6,
      );
      const operation = (req.body as { operationName?: unknown } | undefined)
        ?.operationName;

      logger.ship({
        level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'log',
        context: 'HTTP',
        message: `${req.method} ${path} ${status} ${durationMs}ms`,
        method: req.method,
        path,
        status,
        duration_ms: durationMs,
        ip: req.ip,
        ...(typeof operation === 'string' && { graphql_operation: operation }),
      });
    });

    next();
  };
