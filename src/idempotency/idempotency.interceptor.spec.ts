import {
  BadRequestException,
  type CallHandler,
  ConflictException,
  type ExecutionContext,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PassThrough } from 'stream';
import { lastValueFrom, of, throwError } from 'rxjs';

import {
  Idempotent,
  IdempotencyInterceptor,
} from './idempotency.interceptor.js';
import type { ClaimResult, IdempotencyService } from './idempotency.service.js';

const KEY = '0b6f7c1e-3d0e-4a53-9a39-4f2a7f1d2c11';

class Controller {
  @Idempotent()
  marked() {}

  unmarked() {}
}

const buildRequest = (headers: Record<string, string> = {}) =>
  Object.assign(new PassThrough(), {
    method: 'POST',
    originalUrl: '/api/v1/evidences?x=1',
    headers,
    user: { id: 7 },
  });

const response = { setHeader: jest.fn() };

const contextFor = (
  req: ReturnType<typeof buildRequest>,
  handler: () => void = Controller.prototype.marked,
) =>
  ({
    getType: () => 'http',
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => response,
    }),
  }) as unknown as ExecutionContext;

describe('IdempotencyInterceptor', () => {
  let service: jest.Mocked<
    Pick<IdempotencyService, 'claim' | 'complete' | 'release' | 'markFailed'>
  >;
  let interceptor: IdempotencyInterceptor;
  let next: jest.Mocked<CallHandler>;

  beforeEach(() => {
    service = {
      claim: jest.fn(),
      complete: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    interceptor = new IdempotencyInterceptor(
      new Reflector(),
      service as unknown as IdempotencyService,
    );
    next = { handle: jest.fn(() => of('ok')) };
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  const run = async (req = buildRequest({ 'idempotency-key': KEY })) => {
    const observable = await interceptor.intercept(contextFor(req), next);
    return lastValueFrom(observable);
  };

  const failure = (promise: Promise<unknown>) =>
    promise.then(
      () => undefined,
      (error: HttpException) => error,
    );

  it('sin header funciona como siempre (pestañas con la UI anterior)', async () => {
    await expect(run(buildRequest())).resolves.toBe('ok');
    expect(service.claim).not.toHaveBeenCalled();
  });

  it('en un endpoint sin @Idempotent() no consulta claves', async () => {
    const req = buildRequest({ 'idempotency-key': KEY });
    const observable = await interceptor.intercept(
      contextFor(req, Controller.prototype.unmarked),
      next,
    );

    await expect(lastValueFrom(observable)).resolves.toBe('ok');
    expect(service.claim).not.toHaveBeenCalled();
  });

  it('una clave que no es UUID responde 400', async () => {
    const req = buildRequest({ 'idempotency-key': 'abc' });
    req.end();

    const error = await failure(run(req));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(service.claim).not.toHaveBeenCalled();
  });

  it('clave nueva: ejecuta el endpoint y guarda la respuesta con su estatus (ruta sin query)', async () => {
    service.claim.mockResolvedValue({ kind: 'new' });
    response.setHeader.mockClear();

    await expect(run()).resolves.toBe('ok');
    expect(service.claim).toHaveBeenCalledWith(
      7,
      KEY,
      'POST /api/v1/evidences',
    );
    expect(service.complete).toHaveBeenCalledWith(7, KEY, 201, 'ok');
    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it('clave terminada: devuelve la respuesta guardada sin ejecutar el endpoint y después de leer el cuerpo', async () => {
    service.claim.mockResolvedValue({ kind: 'done', response: { id: 9 } });
    const req = buildRequest({ 'idempotency-key': KEY });
    req.end(Buffer.alloc(64 * 1024));

    await expect(run(req)).resolves.toEqual({ id: 9 });
    expect(next.handle).not.toHaveBeenCalled();
    expect(req.readableEnded).toBe(true);
    // Avisa a la UI que ya se había guardado.
    expect(response.setHeader).toHaveBeenCalledWith(
      'Idempotent-Replayed',
      'true',
    );
  });

  it.each([
    ['processing', 409, 'IDEMPOTENCY_IN_PROGRESS'],
    ['unconfirmed', 409, 'IDEMPOTENCY_UNCONFIRMED'],
    ['mismatch', 422, 'IDEMPOTENCY_KEY_MISMATCH'],
  ] as const)(
    'clave %s: %i con código %s y sin ejecutar',
    async (kind, status, code) => {
      service.claim.mockResolvedValue({ kind } as ClaimResult);
      const req = buildRequest({ 'idempotency-key': KEY });
      req.end();

      const error = await failure(run(req));

      expect(error?.getStatus()).toBe(status);
      expect(error?.getResponse()).toMatchObject({ code });
      expect(next.handle).not.toHaveBeenCalled();
    },
  );

  it('error de datos o de reglas (4xx): libera la clave para reintentar', async () => {
    service.claim.mockResolvedValue({ kind: 'new' });
    const conflict = new ConflictException('ya está cerrado');
    next.handle.mockReturnValue(throwError(() => conflict));

    await expect(failure(run())).resolves.toBe(conflict);
    expect(service.release).toHaveBeenCalledWith(7, KEY);
    expect(service.markFailed).not.toHaveBeenCalled();
  });

  it('error del servidor (5xx): conserva la clave como fallida, por si alcanzó a guardar', async () => {
    service.claim.mockResolvedValue({ kind: 'new' });
    const crash = new Error('conexión perdida');
    next.handle.mockReturnValue(throwError(() => crash));

    await expect(failure(run())).resolves.toBe(crash);
    expect(service.markFailed).toHaveBeenCalledWith(7, KEY);
    expect(service.release).not.toHaveBeenCalled();
  });

  it('si no se puede marcar la clave como terminada, responde igual (ya se guardó)', async () => {
    service.claim.mockResolvedValue({ kind: 'new' });
    service.complete.mockRejectedValue(new Error('BD caída'));

    await expect(run()).resolves.toBe('ok');
  });
});
