import type { ConfigService } from '@nestjs/config';

import * as jwt from 'jsonwebtoken';

import { expireTime } from '@shared/utils';
import { JwtService } from './jwt.service';

describe('JwtService', () => {
  const secret = 'test-secret';
  const service = new JwtService({
    get: () => secret,
  } as unknown as ConfigService);

  it('el token de sesión vence en 30 días (duración relativa)', () => {
    const now = Math.floor(Date.now() / 1000);
    const { exp } = jwt.decode(service.create(1)) as jwt.JwtPayload;

    expect(exp - now).toBeGreaterThanOrEqual(expireTime - 5);
    expect(exp - now).toBeLessThanOrEqual(expireTime + 5);
  });

  it('el token de recuperación vence en 5 minutos', () => {
    const now = Math.floor(Date.now() / 1000);
    const { exp } = jwt.decode(service.create(1, true)) as jwt.JwtPayload;

    expect(exp - now).toBeLessThanOrEqual(5 * 60 + 5);
  });

  it('verifica y devuelve el userId', () => {
    expect(service.verify(service.create(42)).userId).toBe(42);
  });

  it('rechaza tokens firmados con otro algoritmo', () => {
    const token = jwt.sign({ userId: 1 }, secret, { algorithm: 'HS512' });

    expect(() => service.verify(token)).toThrow();
  });
});
