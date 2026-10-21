import {
  createOpenObserveLogger,
  OpenObserveLogger,
  type OpenObserveOptions,
} from './openobserve-logger.js';

describe('OpenObserveLogger', () => {
  const okResponse = { ok: true, status: 200 } as Response;
  let loggers: OpenObserveLogger[] = [];

  const createLogger = (options: Partial<OpenObserveOptions> = {}) => {
    const fetchFn = jest.fn().mockResolvedValue(okResponse);
    const logger = new OpenObserveLogger({
      endpoint: 'http://observe:5080/api/default/',
      authHeader: 'Basic abc',
      stream: 'api_comportarte',
      service: 'api-comportarte',
      fetchFn,
      ...options,
    });
    loggers.push(logger);
    return { logger, fetchFn: (options.fetchFn ?? fetchFn) as jest.Mock };
  };

  const sentBatch = (fetchFn: jest.Mock, call = 0) =>
    JSON.parse(fetchFn.mock.calls[call][1].body);

  beforeEach(() => {
    jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    jest.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(async () => {
    await Promise.all(loggers.map((logger) => logger.close()));
    loggers = [];
    jest.restoreAllMocks();
  });

  it('imprime en consola y envía el lote al endpoint _json', async () => {
    const { logger, fetchFn } = createLogger();

    logger.log('API lista', 'APP-SERVICE');
    await logger.flush();

    expect(process.stdout.write).toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledWith(
      'http://observe:5080/api/default/api_comportarte/_json',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Basic abc',
          'Content-Type': 'application/json',
        },
      }),
    );
    expect(sentBatch(fetchFn)).toEqual([
      expect.objectContaining({
        level: 'log',
        context: 'APP-SERVICE',
        message: 'API lista',
        service: 'api-comportarte',
        _timestamp: expect.any(Number),
      }),
    ]);
  });

  it('incluye el stack de los errores', async () => {
    const { logger, fetchFn } = createLogger();

    logger.error('Falló', 'Error: Falló\n    at x', 'ExceptionsHandler');
    await logger.flush();

    expect(sentBatch(fetchFn)[0]).toMatchObject({
      level: 'error',
      context: 'ExceptionsHandler',
      message: 'Falló',
      stack: 'Error: Falló\n    at x',
    });
  });

  it('convierte errores y objetos en texto', async () => {
    const { logger, fetchFn } = createLogger();
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    logger.warn(new Error('boom'));
    logger.warn({ id: 1 });
    logger.warn(circular);
    await logger.flush();

    const [error, object, unserializable] = sentBatch(fetchFn);
    expect(error).toMatchObject({ message: 'boom', stack: expect.any(String) });
    expect(object.message).toBe('{"id":1}');
    expect(unserializable.message).toBe('[object Object]');
  });

  it('envía al juntar un lote completo, sin esperar al intervalo', async () => {
    const { logger, fetchFn } = createLogger({ maxBatchSize: 2 });

    logger.ship({ level: 'log', message: 'a' });
    expect(fetchFn).not.toHaveBeenCalled();
    logger.ship({ level: 'log', message: 'b' });
    await logger.flush();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(sentBatch(fetchFn)).toHaveLength(2);
  });

  it('envía periódicamente lo pendiente', async () => {
    jest.useFakeTimers();
    try {
      const { logger, fetchFn } = createLogger({ flushIntervalMs: 1000 });

      logger.ship({ level: 'log', message: 'a' });
      await jest.advanceTimersByTimeAsync(1000);

      expect(fetchFn).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('descarta registros por encima del tope de la cola', async () => {
    const { logger, fetchFn } = createLogger({
      maxQueueSize: 1,
      maxBatchSize: 10,
    });

    logger.ship({ level: 'log', message: 'a' });
    logger.ship({ level: 'log', message: 'b' });
    await logger.flush();

    expect(sentBatch(fetchFn)).toEqual([
      expect.objectContaining({ message: 'a' }),
    ]);
  });

  it('avisa una sola vez por racha de fallos y se recupera', async () => {
    const fetchFn = jest
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce(okResponse)
      .mockResolvedValueOnce({ ok: false, status: 500 });
    const { logger } = createLogger({ fetchFn });

    for (const message of ['a', 'b', 'c', 'd']) {
      logger.ship({ level: 'log', message });
      await logger.flush();
    }

    expect(process.stderr.write).toHaveBeenCalledTimes(2);
    expect(process.stderr.write).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('ECONNREFUSED'),
    );
    expect(process.stderr.write).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('HTTP 500'),
    );
  });

  it('usa fetch global si no se le pasa otro', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse);
    const { logger } = createLogger({ fetchFn: undefined });

    logger.ship({ level: 'log', message: 'a' });
    await logger.flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('createOpenObserveLogger', () => {
  const config = {
    environment: 'production',
    endpoint: 'http://observe:5080/api/default',
    authHeader: 'Basic abc',
  };

  it('solo se crea en producción con endpoint y credenciales', async () => {
    expect(
      createOpenObserveLogger({ ...config, environment: 'development' }),
    ).toBeNull();
    expect(createOpenObserveLogger({ ...config, endpoint: '' })).toBeNull();
    expect(
      createOpenObserveLogger({ ...config, authHeader: undefined }),
    ).toBeNull();

    const logger = createOpenObserveLogger(config);
    expect(logger).toBeInstanceOf(OpenObserveLogger);
    await logger?.close();
  });

  it('usa el stream indicado o api_comportarte por defecto', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response);

    for (const [stream, expected] of [
      [undefined, 'api_comportarte'],
      ['otro', 'otro'],
    ]) {
      const logger = createOpenObserveLogger({ ...config, stream })!;
      logger.ship({ level: 'log', message: 'a' });
      await logger.close();
      expect(fetchSpy).toHaveBeenLastCalledWith(
        `http://observe:5080/api/default/${expected}/_json`,
        expect.anything(),
      );
    }

    fetchSpy.mockRestore();
  });
});
