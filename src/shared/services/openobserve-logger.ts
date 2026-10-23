import { ConsoleLogger, type LogLevel } from '@nestjs/common';

export interface OpenObserveOptions {
  // Base de la organización, p. ej. http://host:5080/api/default
  endpoint: string;
  // Header Authorization completo ("Basic ...").
  authHeader: string;
  // Stream de logs en OpenObserve.
  stream: string;
  // Nombre del servicio en cada registro.
  service: string;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  // Tope de registros en espera si OpenObserve no responde.
  maxQueueSize?: number;
  fetchFn?: typeof fetch;
}

export type OpenObserveEntry = Record<string, unknown> & {
  level: string;
  message: string;
};

type QueuedEntry = OpenObserveEntry & {
  _timestamp: number;
  service: string;
};

// Arranque de Nest: ~380 líneas por reinicio ("Mapped route…",
// "dependencies initialized") que eran el 84 % de los logs en OpenObserve.
// Se siguen viendo en pm2; sus errores y avisos sí se envían.
const STARTUP_CONTEXTS = new Set([
  'RouterExplorer',
  'InstanceLoader',
  'RoutesResolver',
]);

/**
 * Logger de Nest que, además de escribir en consola (pm2), envía cada
 * registro en lotes a OpenObserve por su API de ingesta `_json`. Si
 * OpenObserve falla, los lotes se descartan: los logs nunca frenan la API.
 */
export class OpenObserveLogger extends ConsoleLogger {
  private queue: QueuedEntry[] = [];
  private readonly url: string;
  private readonly maxBatchSize: number;
  private readonly maxQueueSize: number;
  private readonly fetchFn: typeof fetch;
  private readonly timer: NodeJS.Timeout;
  private sending: Promise<void> = Promise.resolve();
  private failing = false;

  // `observeOptions` y no `options`: ConsoleLogger ya usa ese nombre.
  constructor(private readonly observeOptions: OpenObserveOptions) {
    super();
    const { endpoint, stream } = observeOptions;
    this.url = `${endpoint.replace(/\/+$/, '')}/${stream}/_json`;
    this.maxBatchSize = observeOptions.maxBatchSize ?? 100;
    this.maxQueueSize = observeOptions.maxQueueSize ?? 5000;
    this.fetchFn = observeOptions.fetchFn ?? fetch;
    this.timer = setInterval(
      () => void this.flush(),
      observeOptions.flushIntervalMs ?? 2000,
    );
    // El envío periódico no mantiene vivo el proceso.
    this.timer.unref();
  }

  /** Envía un registro solo a OpenObserve (sin imprimirlo en consola). */
  ship(entry: OpenObserveEntry) {
    if (this.queue.length >= this.maxQueueSize) return;

    this.queue.push({
      _timestamp: Date.now() * 1000,
      service: this.observeOptions.service,
      ...entry,
    });

    if (this.queue.length >= this.maxBatchSize) void this.flush();
  }

  /** Envía lo pendiente; los envíos no se traslapan. */
  flush(): Promise<void> {
    this.sending = this.sending.then(async () => {
      while (this.queue.length) {
        await this.send(this.queue.splice(0, this.maxBatchSize));
      }
    });
    return this.sending;
  }

  /** Detiene el envío periódico y manda lo pendiente. */
  async close() {
    clearInterval(this.timer);
    await this.flush();
  }

  // En producción corre bajo pm2, que ya antepone fecha y hora a cada línea
  // (`log_date_format` en ecosystem.config.js): la de Nest saldría repetida.
  protected getTimestamp() {
    return '';
  }

  protected formatPid(pid: number) {
    return `[${this.options.prefix}] ${pid}`;
  }

  protected printMessages(
    messages: unknown[],
    context?: string,
    logLevel?: LogLevel,
    writeStreamType?: 'stdout' | 'stderr',
    errorStack?: unknown,
    params?: Record<string, any>,
  ) {
    super.printMessages(
      messages,
      context,
      logLevel,
      writeStreamType,
      errorStack,
      params,
    );

    if (logLevel === 'log' && context && STARTUP_CONTEXTS.has(context)) return;

    for (const message of messages) {
      this.ship({
        level: logLevel ?? 'log',
        ...(context && { context }),
        ...toEntryFields(message),
        ...(typeof errorStack === 'string' && { stack: errorStack }),
      });
    }
  }

  private async send(batch: QueuedEntry[]) {
    try {
      const response = await this.fetchFn(this.url, {
        method: 'POST',
        headers: {
          Authorization: this.observeOptions.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.failing = false;
    } catch (error) {
      // Un aviso por racha de fallos, directo a stderr: pasar por el logger
      // volvería a encolar el aviso.
      if (!this.failing) {
        this.failing = true;
        process.stderr.write(
          `[OpenObserve] No se pudieron enviar logs a ${this.url}: ${
            (error as Error)?.message ?? error
          }\n`,
        );
      }
    }
  }
}

// Mensaje del logger a campos del registro.
const toEntryFields = (
  message: unknown,
): { message: string; stack?: string } => {
  if (message instanceof Error) {
    return { message: message.message, stack: message.stack };
  }
  if (typeof message === 'string') return { message };
  try {
    return { message: JSON.stringify(message) };
  } catch {
    return { message: String(message) };
  }
};

export interface ObserveConfig {
  environment?: string;
  endpoint?: string;
  authHeader?: string;
  stream?: string;
}

/**
 * Logger de OpenObserve solo en producción y con endpoint y credenciales
 * configurados; en cualquier otro caso `null` (se usa el logger normal).
 */
export const createOpenObserveLogger = ({
  environment,
  endpoint,
  authHeader,
  stream,
}: ObserveConfig) => {
  if (environment !== 'production' || !endpoint || !authHeader) return null;

  return new OpenObserveLogger({
    endpoint,
    authHeader,
    stream: stream || 'api_comportarte',
    service: 'api-comportarte',
  });
};
