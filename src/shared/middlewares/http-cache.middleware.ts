import type { NextFunction, Request, Response } from 'express';

// Archivos que se descargan (Excel, PDF, HDS, comprobantes de EPP e
// inspecciones): documentos privados que no deben quedar en disco.
const DOWNLOAD = /\/download(?:\/|$)/;

/**
 * Caché HTTP de las lecturas. Express genera el ETag de cada respuesta
 * (débil, `app.set('etag', 'weak')`) y responde 304 sin cuerpo cuando el
 * navegador lo manda en If-None-Match: los catálogos y listas que no
 * cambiaron no se vuelven a descargar.
 *
 * Aquí se fija cómo se guardan, que antes dependía del comportamiento por
 * omisión del navegador:
 * - `private`: solo en el navegador del usuario; nunca en un proxy o CDN
 *   compartido (las respuestas dependen de la sesión).
 * - `no-cache`: se guarda, pero siempre se revalida con el ETag; nunca se
 *   usa una copia vieja sin preguntar.
 * - Descargas: `no-store`, no se guardan.
 *
 * Una ruta puede fijar su propia Cache-Control después (p. ej. las fotos de
 * evidencias, también `no-store`).
 */
export const httpCacheHeaders = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (req.method === 'GET' || req.method === 'HEAD')
    res.setHeader(
      'Cache-Control',
      DOWNLOAD.test(req.path) ? 'private, no-store' : 'private, no-cache',
    );
  next();
};
