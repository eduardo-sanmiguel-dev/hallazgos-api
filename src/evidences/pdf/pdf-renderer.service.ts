import {
  HttpException,
  HttpStatus,
  Injectable,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { TDocumentDefinitions } from 'pdfmake/interfaces.js';

import { ERROR_CODES, apiError } from '../../shared/errors/error-codes.js';
import {
  WorkerPool,
  WorkerPoolBusyError,
} from '../../shared/utils/worker-pool.js';
import { traced } from '../../shared/tracing/traced.js';

/**
 * Hilo de pdfmake por proceso. Producción corre dos procesos (PM2): dos PDF a
 * la vez como máximo, y cada uno deja libres los demás núcleos.
 */
const PDF_WORKERS = 1;
/** PDF en espera por proceso; más allá, 429 y se intenta en un momento. */
const PDF_MAX_QUEUE = 4;
/** Un PDF de 500 filas con miniaturas usa ~150 MB; holgura sin arriesgar la API. */
const PDF_WORKER_MEMORY_MB = 768;

export const PDF_BUSY_MESSAGE =
  'Se están generando muchos PDF en este momento. Intenta de nuevo en un minuto.';

/**
 * Arma PDF de pdfmake en un worker_threads (render-pdf.worker.mjs): el CPU
 * que ocupa no bloquea las demás peticiones de la API.
 */
@Injectable()
export class PdfRendererService implements OnModuleDestroy {
  private readonly pool = new WorkerPool<TDocumentDefinitions, ArrayBuffer>(
    new URL('./render-pdf.worker.mjs', import.meta.url),
    {
      size: PDF_WORKERS,
      maxQueue: PDF_MAX_QUEUE,
      resourceLimits: { maxOldGenerationSizeMb: PDF_WORKER_MEMORY_MB },
    },
  );

  // pdf.queued: PDF que ya esperaban; con el hilo ocupado, parte del tiempo
  // del span es espera y no armado.
  render(docDefinition: TDocumentDefinitions): Promise<Buffer> {
    return traced(
      'pdf.render',
      { 'pdf.queued': this.pool.queued },
      async (span) => {
        try {
          const pdf = Buffer.from(await this.pool.run(docDefinition));
          span.setAttribute('pdf.bytes', pdf.length);
          return pdf;
        } catch (error) {
          if (error instanceof WorkerPoolBusyError)
            throw new HttpException(
              apiError(PDF_BUSY_MESSAGE, ERROR_CODES.tooManyRequests),
              HttpStatus.TOO_MANY_REQUESTS,
            );
          throw error;
        }
      },
    );
  }

  onModuleDestroy() {
    return this.pool.close();
  }
}
