import { EventEmitter } from 'node:events';

import type { NextFunction, Request, Response } from 'express';

import { httpAccessLog } from './http-access-log.middleware.js';

describe('httpAccessLog', () => {
  const ship = jest.fn();
  const middleware = httpAccessLog({ ship });

  const run = (
    request: Partial<Request>,
    statusCode = 200,
  ): { next: NextFunction; finish: () => void } => {
    const response = Object.assign(new EventEmitter(), { statusCode });
    const next = jest.fn();
    middleware(
      { method: 'GET', ip: '10.0.0.1', ...request } as Request,
      response as unknown as Response,
      next,
    );
    return { next, finish: () => response.emit('finish') };
  };

  beforeEach(() => ship.mockClear());

  it('registra la petición al terminar, sin query string', () => {
    const { next, finish } = run({
      originalUrl: '/api/v1/evidences?token=secreto',
    });

    expect(next).toHaveBeenCalledTimes(1);
    expect(ship).not.toHaveBeenCalled();
    finish();

    expect(ship).toHaveBeenCalledWith({
      level: 'log',
      context: 'HTTP',
      message: expect.stringMatching(/^GET \/api\/v1\/evidences 200 \d+ms$/),
      method: 'GET',
      path: '/api/v1/evidences',
      status: 200,
      duration_ms: expect.any(Number),
      ip: '10.0.0.1',
    });
  });

  it('agrega la operación de GraphQL', () => {
    const { finish } = run({
      method: 'POST',
      originalUrl: '/graphql',
      body: { operationName: 'Evidences' },
    });
    finish();

    expect(ship).toHaveBeenCalledWith(
      expect.objectContaining({ graphql_operation: 'Evidences' }),
    );
  });

  it.each([
    [404, 'warn'],
    [500, 'error'],
  ])('status %i se registra como %s', (status, level) => {
    const { finish } = run({ originalUrl: '/api/v1/x' }, status);
    finish();

    expect(ship).toHaveBeenCalledWith(expect.objectContaining({ level }));
  });

  it('omite el health check', () => {
    const { next, finish } = run({ originalUrl: '/api/v1/health' });
    finish();

    expect(next).toHaveBeenCalledTimes(1);
    expect(ship).not.toHaveBeenCalled();
  });
});
