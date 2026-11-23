import helmet from 'helmet';

/**
 * Cabeceras de seguridad de la API (helmet). La API solo responde JSON y
 * archivos (fotos, PDF, Excel), nunca páginas: su CSP no permite nada. Así,
 * si alguien abre directo una respuesta en el navegador (un archivo subido,
 * un error con texto del usuario), no puede ejecutar scripts, cargar recursos
 * ni incrustarse en otro sitio. Las imágenes y PDF que la UI muestra no se
 * ven afectados: la CSP de un recurso solo aplica cuando se abre como página.
 *
 * HSTS (solo HTTPS, un año) y X-Frame-Options DENY explícitos: antes eran
 * los valores por omisión de helmet (y el de iframes, SAMEORIGIN).
 *
 * CORP cross-origin: el front (otro origen) carga imágenes y PDF de aquí.
 */
export const securityHeaders = () =>
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
    xFrameOptions: { action: 'deny' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
