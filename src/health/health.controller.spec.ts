import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { HealthController } from './health.controller';

describe('HealthController', () => {
  const query = jest.fn();
  const controller = new HealthController({ query } as unknown as DataSource);

  it('con la base respondiendo devuelve ok y el tiempo en línea', async () => {
    query.mockResolvedValue([{ '?column?': 1 }]);

    const result = await controller.check();

    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(result).toMatchObject({ status: 'ok', database: 'up' });
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
});
