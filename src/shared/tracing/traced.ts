import {
  type Attributes,
  type Span,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';

/**
 * Las trazas de producción (src/instrumentation.ts) solo ven HTTP, Express y
 * SQL. El trabajo dentro de Node (recibir una foto, convertir imágenes, armar
 * un PDF o un Excel, preparar correos) quedaba como tiempo sin explicar dentro
 * de la petición. `traced` lo envuelve en un span propio, hijo del span activo.
 *
 * Sin el SDK de OpenTelemetry (desarrollo, pruebas) el tracer es no-op: solo
 * ejecuta `work`.
 */
const tracer = trace.getTracer('api-comportarte');

export const traced = <T>(
  name: string,
  attributes: Attributes,
  work: (span: Span) => Promise<T>,
): Promise<T> =>
  tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await work(span);
    } catch (error) {
      span.recordException(
        error instanceof Error ? error : new Error(String(error)),
      );
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  });
