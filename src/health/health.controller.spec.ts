import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import type { CacheService } from '../shared/cache/cache.service.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  const query = jest.fn();
  const status = jest.fn().mockResolvedValue('up');
  const controller = new HealthController(
    { query } as unknown as DataSource,
    { status } as unknown as CacheService,
  );

  it('con la base respondiendo devuelve ok y el tiempo en línea', async () => {
    query.mockResolvedValue([{ '?column?': 1 }]);

    const result = await controller.check();

    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(result).toMatchObject({ status: 'ok', database: 'up', cache: 'up' });
    expect(Number.isInteger(result.uptimeSeconds)).toBe(true);
  });

  it('sin base responde 503 sin detalles y lo registra', async () => {
    query.mockRejectedValue(new Error('ECONNREFUSED'));
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(controller.check()).rejects.toThrow(
      new ServiceUnavailableException({ status: 'error', database: 'down' }),
    );
    expect(logError).toHaveBeenCalledWith(
      'La base de datos no responde',
      expect.any(String),
    );
    logError.mockRestore();
  });

  it('sin caché sigue respondiendo ok (la API funciona contra la base) e informa down', async () => {
    query.mockResolvedValue([{ '?column?': 1 }]);
    status.mockResolvedValue('down');

    await expect(controller.check()).resolves.toMatchObject({
      status: 'ok',
      database: 'up',
      cache: 'down',
    });
  });
});
