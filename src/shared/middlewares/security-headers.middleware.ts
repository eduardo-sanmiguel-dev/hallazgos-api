import helmet from 'helmet';

/**
 * Cabeceras de seguridad de la API (helmet). La API solo responde JSON y
 * archivos (fotos, PDF, Excel), nunca páginas: su CSP no permite nada. Así,
 * si alguien abre directo una respuesta en el navegador (un archivo subido,
 * un error con texto del usuario), no puede ejecutar scripts, cargar recursos
 * ni incrustarse en otro sitio. Las imágenes y PDF que la UI muestra no se
 * ven afectados: la CSP de un recurso solo aplica cuando se abre como página.
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
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
