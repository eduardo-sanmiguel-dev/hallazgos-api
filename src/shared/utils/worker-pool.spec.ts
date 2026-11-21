import { WorkerPool, WorkerPoolBusyError } from './worker-pool.js';

type Job = { op: string; value?: unknown; ms?: number };

const FIXTURE = new URL('./worker-pool.fixture.mjs', import.meta.url);

describe('WorkerPool', () => {
  let pool: WorkerPool<Job, unknown>;
  const create = (size = 1, maxQueue = 10) =>
    (pool = new WorkerPool<Job, unknown>(FIXTURE, { size, maxQueue }));

  afterEach(() => pool?.close());

  it('ejecuta en un hilo y devuelve el resultado', async () => {
    create();

    await expect(pool.run({ op: 'echo', value: 'hola' })).resolves.toBe('hola');
    // El hilo queda listo para la siguiente tarea.
    await expect(pool.run({ op: 'echo', value: 2 })).resolves.toBe(2);
  });

  it('con un solo hilo atiende en orden; la cola cuenta las que esperan', async () => {
    create(1);
    const order: number[] = [];

    const tasks = [1, 2, 3].map((value) =>
      pool
        .run({ op: 'wait', value, ms: 20 })
        .then((result) => order.push(result as number)),
    );
    expect(pool.queued).toBe(2);
    await Promise.all(tasks);

    expect(order).toEqual([1, 2, 3]);
    expect(pool.queued).toBe(0);
  });

  it('con la cola llena rechaza con WorkerPoolBusyError', async () => {
    create(1, 1);
    const running = pool.run({ op: 'wait', value: 'a', ms: 50 });
    const queued = pool.run({ op: 'echo', value: 'b' });

    await expect(pool.run({ op: 'echo' })).rejects.toBeInstanceOf(
      WorkerPoolBusyError,
    );
    await expect(Promise.all([running, queued])).resolves.toEqual(['a', 'b']);
  });

  it('un error de la tarea la rechaza con su mensaje y el hilo sigue', async () => {
    create();

    await expect(pool.run({ op: 'fail' })).rejects.toThrow('falló la tarea');
    await expect(pool.run({ op: 'echo', value: 'ok' })).resolves.toBe('ok');
  });

  it('si el hilo muere, su tarea falla y otro hilo atiende la cola', async () => {
    create(1);

    const crashed = pool.run({ op: 'crash' });
    const next = pool.run({ op: 'echo', value: 'sigue' });

    await expect(crashed).rejects.toThrow('El hilo terminó con código 3');
    await expect(next).resolves.toBe('sigue');
  });

  it('una excepción sin manejar en el hilo rechaza la tarea', async () => {
    create();

    await expect(pool.run({ op: 'throw' })).rejects.toThrow(
      'error sin manejar',
    );
    await expect(pool.run({ op: 'echo', value: 1 })).resolves.toBe(1);
  });

  it('un hilo libre que termina sale del pool sin afectar a nadie', async () => {
    create();

    await expect(pool.run({ op: 'reply-and-exit', value: 'x' })).resolves.toBe(
      'x',
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(pool.run({ op: 'echo', value: 'nuevo' })).resolves.toBe(
      'nuevo',
    );
  });

  it('close rechaza lo que corre y lo que espera, y no acepta más', async () => {
    create(1);
    const running = expect(pool.run({ op: 'wait', ms: 1000 })).rejects.toThrow(
      'El pool está cerrado',
    );
    const queued = expect(pool.run({ op: 'echo' })).rejects.toThrow(
      'El pool está cerrado',
    );

    await pool.close();

    await Promise.all([running, queued]);
    await expect(pool.run({ op: 'echo' })).rejects.toThrow(
      'El pool está cerrado',
    );
  });
});
