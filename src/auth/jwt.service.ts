import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import * as jwt from 'jsonwebtoken';

import { expireTime } from '@shared/utils';

// Algoritmo con el que se firmaban los tokens (default de jsonwebtoken):
// fijarlo evita aceptar tokens firmados con otro algoritmo.
const JWT_ALGORITHM = 'HS256';

interface JwtPayload {
  userId: number;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtService {
  secretKey: string;

  constructor(private readonly configService: ConfigService) {
    this.secretKey = this.configService.get<string>('jwt.secretKey');
  }

  create(userId: number, isForgotPassword = false): string {
    // `expiresIn` es una duración relativa (segundos). Antes recibía un
    // timestamp absoluto y los tokens quedaban vigentes por décadas.
    const token = jwt.sign({ userId }, this.secretKey, {
      algorithm: JWT_ALGORITHM,
      expiresIn: isForgotPassword ? '5m' : expireTime,
    });
    return token;
  }

  verify(token: string): JwtPayload {
    const decoded = jwt.verify(token, this.secretKey, {
      algorithms: [JWT_ALGORITHM],
    }) as JwtPayload;
    return decoded;
  }
}
