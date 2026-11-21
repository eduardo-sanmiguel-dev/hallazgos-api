import type { NextFunction, Request, Response } from 'express';

/**
 * `Timing-Allow-Origin` para la UI: sin él, el navegador oculta al RUM de
 * OpenObserve el desglose de cada llamada a la API (DNS, conexión, TLS,
 * espera, descarga) y su tamaño, por ser de otro dominio. Solo ese origen
 * los puede leer.
 */
export const timingAllowOrigin =
  (frontendUrl: string) =>
  (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Timing-Allow-Origin', frontendUrl);
    next();
  };
