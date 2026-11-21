import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';

/**
 * Segundos que el navegador recuerda un preflight (OPTIONS). La UI vive en
 * otro dominio y casi cada lectura lleva cabeceras que lo exigen (traceparent
 * del RUM): sin esto Chrome lo guardaba 5 s y en dos semanas hubo ~13 mil
 * OPTIONS por ~15 mil lecturas, una ida y vuelta extra antes de cada una.
 * Chrome no guarda más de 2 h; Firefox, 24 h.
 */
export const CORS_PREFLIGHT_MAX_AGE_SECONDS = 2 * 60 * 60;

/** CORS de la API: solo la UI, con sus cookies de sesión. */
export const corsOptions = (frontendUrl: string): CorsOptions => ({
  origin: frontendUrl,
  credentials: true,
  // El front lee el nombre del archivo de las descargas y si un envío ya
  // se había procesado (reintento con la misma clave de idempotencia).
  exposedHeaders: ['Content-Disposition', 'Idempotent-Replayed'],
  maxAge: CORS_PREFLIGHT_MAX_AGE_SECONDS,
});
