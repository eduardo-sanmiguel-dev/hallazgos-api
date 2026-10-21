import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { createHmac, timingSafeEqual } from 'crypto';
import * as jwt from 'jsonwebtoken';

import { expireTime } from '@shared/utils';

// Algoritmo con el que se firmaban los tokens (default de jsonwebtoken):
// fijarlo evita aceptar tokens firmados con otro algoritmo.
const JWT_ALGORITHM = 'HS256';

// Vigencia del token del correo de recuperación de contraseña.
const RESET_TOKEN_EXPIRES_IN = '5m';

export const TOKEN_PURPOSE = {
  session: 'session',
  reset: 'reset',
} as const;
type TokenPurpose = (typeof TOKEN_PURPOSE)[keyof typeof TOKEN_PURPOSE];

export interface JwtPayload {
  userId: number;
  // Los tokens de sesión emitidos antes de agregar `purpose` no lo traen y
  // se siguen aceptando como sesión (ver verify).
  purpose?: TokenPurpose;
  // Solo en tokens de recuperación: huella de la contraseña vigente al
  // emitirlo (ver passwordFingerprint).
  pwd?: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtService {
  secretKey: string;

  constructor(private readonly configService: ConfigService) {
    this.secretKey = this.configService.get<string>('jwt.secretKey');
  }

  /** Token de sesión (cookie/Authorization) de 30 días. */
  create(userId: number): string {
    // `expiresIn` es una duración relativa (segundos). Antes recibía un
    // timestamp absoluto y los tokens quedaban vigentes por décadas.
    return jwt.sign(
      { userId, purpose: TOKEN_PURPOSE.session },
      this.secretKey,
      { algorithm: JWT_ALGORITHM, expiresIn: expireTime },
    );
  }

  /**
   * Token del correo de recuperación (5 minutos). Lleva la huella de la
   * contraseña actual: en cuanto la contraseña cambia deja de servir, así que
   * es de un solo uso sin guardar nada en la base.
   */
  createResetToken(userId: number, currentPasswordHash: string): string {
    return jwt.sign(
      {
        userId,
        purpose: TOKEN_PURPOSE.reset,
        pwd: this.passwordFingerprint(currentPasswordHash),
      },
      this.secretKey,
      { algorithm: JWT_ALGORITHM, expiresIn: RESET_TOKEN_EXPIRES_IN },
    );
  }

  /** Verifica un token de SESIÓN: rechaza los de recuperación. */
  verify(token: string): JwtPayload {
    const payload = this.decodeAndVerify(token);

    // TODO(2026-11-20): quitar la aceptación de tokens sin `purpose`. Es
    // temporal, para no cerrar las sesiones abiertas antes del deploy del
    // cambio de recuperación de contraseña (30 días = vida de una sesión).
    // Al quitarla: exigir `payload.purpose === TOKEN_PURPOSE.session` y
    // ajustar el test "[temporal hasta 2026-11-20] ..." de jwt.service.spec.
    if (
      payload.purpose !== undefined &&
      payload.purpose !== TOKEN_PURPOSE.session
    ) {
      throw new jwt.JsonWebTokenError('El token no es de sesión');
    }

    return payload;
  }

  /**
   * Verifica un token de RECUPERACIÓN y que siga correspondiendo a la
   * contraseña actual del usuario (no usado aún).
   */
  verifyResetToken(token: string, currentPasswordHash: string): JwtPayload {
    const payload = this.decodeResetToken(token);

    if (!this.sameFingerprint(payload.pwd, currentPasswordHash)) {
      throw new jwt.JsonWebTokenError('El token ya fue utilizado');
    }

    return payload;
  }

  /** Firma, vigencia y propósito de un token de recuperación. */
  decodeResetToken(token: string): JwtPayload {
    const payload = this.decodeAndVerify(token);

    if (payload.purpose !== TOKEN_PURPOSE.reset || !payload.pwd) {
      throw new jwt.JsonWebTokenError('El token no es de recuperación');
    }

    return payload;
  }

  private decodeAndVerify(token: string): JwtPayload {
    const payload = jwt.verify(token, this.secretKey, {
      algorithms: [JWT_ALGORITHM],
    });
    if (
      typeof payload === 'string' ||
      !Number.isInteger(payload.userId) ||
      payload.userId <= 0
    ) {
      throw new jwt.JsonWebTokenError('Usuario del token no válido');
    }
    return payload as JwtPayload;
  }

  /**
   * HMAC del hash de la contraseña: identifica la contraseña vigente sin
   * exponer el hash (el payload del JWT es legible por cualquiera).
   */
  private passwordFingerprint(passwordHash: string): string {
    return createHmac('sha256', this.secretKey)
      .update(passwordHash ?? '')
      .digest('base64url');
  }

  private sameFingerprint(fingerprint: string, passwordHash: string) {
    const expected = Buffer.from(this.passwordFingerprint(passwordHash));
    const received = Buffer.from(fingerprint ?? '');
    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  }
}
