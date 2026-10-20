import type { ConfigService } from '@nestjs/config';

import * as jwt from 'jsonwebtoken';

import { expireTime } from '@shared/utils';
import { JwtService, TOKEN_PURPOSE } from './jwt.service';

describe('JwtService', () => {
  const secret = 'test-secret';
  const service = new JwtService({
    get: () => secret,
  } as unknown as ConfigService);
  const now = () => Math.floor(Date.now() / 1000);

  describe('tokens de sesión', () => {
    it('vencen en 30 días (duración relativa)', () => {
      const { exp } = jwt.decode(service.create(1)) as jwt.JwtPayload;

      expect(exp - now()).toBeGreaterThanOrEqual(expireTime - 5);
      expect(exp - now()).toBeLessThanOrEqual(expireTime + 5);
    });

    it('se verifican y devuelven el userId', () => {
      expect(service.verify(service.create(42)).userId).toBe(42);
    });

    it('se aceptan los emitidos antes de existir `purpose` (sesiones vigentes)', () => {
      const legacy = jwt.sign({ userId: 5 }, secret, {
        algorithm: 'HS256',
        expiresIn: 60,
      });

      expect(service.verify(legacy).userId).toBe(5);
    });

    it('no se acepta un token de recuperación como sesión', () => {
      const reset = service.createResetToken(1, 'hash-actual');

      expect(() => service.verify(reset)).toThrow(jwt.JsonWebTokenError);
    });

    it('rechaza tokens firmados con otro algoritmo', () => {
      const token = jwt.sign({ userId: 1 }, secret, { algorithm: 'HS512' });

      expect(() => service.verify(token)).toThrow();
    });

    it('rechaza un token vencido', () => {
      const expired = jwt.sign({ userId: 1 }, secret, {
        algorithm: 'HS256',
        expiresIn: -10,
      });

      expect(() => service.verify(expired)).toThrow(jwt.TokenExpiredError);
    });
  });

  describe('tokens de recuperación', () => {
    it('vencen en 5 minutos (ni más ni menos)', () => {
      const { exp } = jwt.decode(
        service.createResetToken(1, 'hash-actual'),
      ) as jwt.JwtPayload;

      expect(exp - now()).toBeGreaterThanOrEqual(5 * 60 - 5);
      expect(exp - now()).toBeLessThanOrEqual(5 * 60 + 5);
    });

    it('llevan propósito "reset" y no exponen el hash de la contraseña', () => {
      const token = service.createResetToken(1, '$argon2id$hash-secreto');
      const payload = jwt.decode(token) as jwt.JwtPayload;

      expect(payload.purpose).toBe(TOKEN_PURPOSE.reset);
      expect(token).not.toContain('hash-secreto');
      expect(JSON.stringify(payload)).not.toContain('hash-secreto');
    });

    it('son válidos mientras la contraseña no cambie', () => {
      const token = service.createResetToken(3, 'hash-actual');

      expect(service.verifyResetToken(token, 'hash-actual').userId).toBe(3);
    });

    it('dejan de servir en cuanto cambia la contraseña (un solo uso)', () => {
      const token = service.createResetToken(3, 'hash-actual');

      expect(() => service.verifyResetToken(token, 'hash-nuevo')).toThrow(
        jwt.JsonWebTokenError,
      );
    });

    it('no se acepta un token de sesión como token de recuperación', () => {
      const session = service.create(3);

      expect(() => service.decodeResetToken(session)).toThrow(
        jwt.JsonWebTokenError,
      );
    });

    it('no se acepta un token sin propósito (formato anterior)', () => {
      const legacy = jwt.sign({ userId: 3 }, secret, {
        algorithm: 'HS256',
        expiresIn: 60,
      });

      expect(() => service.decodeResetToken(legacy)).toThrow(
        jwt.JsonWebTokenError,
      );
    });

    it.each([
      ['sin huella', { userId: 3, purpose: 'reset' }],
      ['con la huella alterada', { userId: 3, purpose: 'reset', pwd: 'abc' }],
    ])('rechaza un token de recuperación %s', (_c, payload) => {
      const token = jwt.sign(payload, secret, {
        algorithm: 'HS256',
        expiresIn: 60,
      });

      expect(() => service.verifyResetToken(token, 'hash-actual')).toThrow(
        jwt.JsonWebTokenError,
      );
    });

    it('rechaza un token de recuperación vencido', () => {
      const expired = jwt.sign(
        { userId: 3, purpose: 'reset', pwd: 'x' },
        secret,
        { algorithm: 'HS256', expiresIn: -10 },
      );

      expect(() => service.decodeResetToken(expired)).toThrow(
        jwt.TokenExpiredError,
      );
    });
  });
});
