import { Worker, type ResourceLimits } from 'worker_threads';

/** La cola del pool está llena: conviene responder 429 y reintentar luego. */
export class WorkerPoolBusyError extends Error {
  constructor() {
    super('La cola de trabajo está llena');
    this.name = 'WorkerPoolBusyError';
  }
}

export interface WorkerPoolOptions {
  /** Hilos como máximo (se crean al necesitarse). */
  size: number;
  /** Tareas en espera como máximo; más allá, WorkerPoolBusyError. */
  maxQueue: number;
  /** Límite de memoria por hilo: si lo pasa, muere el hilo, no la API. */
  resourceLimits?: ResourceLimits;
}

interface Task<O> {
  input: unknown;
  resolve: (result: O) => void;
  reject: (error: Error) => void;
}

/**
 * Respuesta del hilo: `{ result }` o `{ error }` (texto). El hilo recibe la
 * entrada tal cual por postMessage y atiende una tarea a la vez.
 */
type WorkerReply<O> = { result?: O; error?: string };

/**
 * Pool de worker_threads con cola FIFO acotada, para trabajo de CPU (p. ej.
 * armar PDF) que bloquearía el hilo principal de la API.
 *
 * - Los hilos se crean al llegar trabajo y quedan listos para el siguiente.
 * - Si un hilo muere (error, falta de memoria), su tarea falla y el pool crea
 *   otro para lo que sigue en la cola.
 * - Los hilos no mantienen vivo el proceso (`unref`): al apagar, `close()`.
 */
export class WorkerPool<I, O> {
  private readonly workers = new Set<Worker>();
  private readonly idle: Worker[] = [];
  private readonly running = new Map<Worker, Task<O>>();
  private readonly queue: Task<O>[] = [];
  private closed = false;

  constructor(
    private readonly file: URL,
    private readonly options: WorkerPoolOptions,
  ) {}

  /** Tareas en espera (sin contar las que ya corren). */
  get queued() {
    return this.queue.length;
  }

  run(input: I): Promise<O> {
    if (this.closed) return Promise.reject(new Error('El pool está cerrado'));
    if (this.queue.length >= this.options.maxQueue)
      return Promise.reject(new WorkerPoolBusyError());
    return new Promise<O>((resolve, reject) => {
      this.queue.push({ input, resolve, reject });
      this.dispatch();
    });
  }

  async close() {
    this.closed = true;
    const error = new Error('El pool está cerrado');
    for (const task of this.queue.splice(0)) task.reject(error);
    for (const task of this.running.values()) task.reject(error);
    this.running.clear();
    const workers = [...this.workers];
    this.workers.clear();
    this.idle.length = 0;
    await Promise.all(
      workers.map((worker) => {
        // Una respuesta tardía ya no tiene tarea a la cual entregarse.
        worker.removeAllListeners('message');
        return worker.terminate();
      }),
    );
  }

  private dispatch() {
    while (this.queue.length) {
      const worker =
        this.idle.pop() ??
        (this.workers.size < this.options.size ? this.spawn() : undefined);
      if (!worker) return;
      const task = this.queue.shift();
      this.running.set(worker, task);
      worker.postMessage(task.input);
    }
  }

  private spawn() {
    const worker = new Worker(this.file, {
      resourceLimits: this.options.resourceLimits,
    });
    worker.unref();
    this.workers.add(worker);
    worker.on('message', (reply: WorkerReply<O>) => {
      const task = this.running.get(worker);
      this.running.delete(worker);
      this.idle.push(worker);
      if (reply.error !== undefined) task.reject(new Error(reply.error));
      else task.resolve(reply.result);
      this.dispatch();
    });
    worker.on('error', (error) => this.discard(worker, error));
    worker.on('exit', (code) =>
      this.discard(worker, new Error(`El hilo terminó con código ${code}`)),
    );
    return worker;
  }

  /** Saca del pool un hilo muerto; falla su tarea y sigue con la cola. */
  private discard(worker: Worker, error: Error) {
    // 'error' y 'exit' llegan los dos; también tras close().
    if (!this.workers.delete(worker)) return;
    const index = this.idle.indexOf(worker);
    if (index >= 0) this.idle.splice(index, 1);
    this.running.get(worker)?.reject(error);
    this.running.delete(worker);
    this.dispatch();
  }
}
