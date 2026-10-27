import { Injectable, type NestMiddleware } from '@nestjs/common';
import { JwtService } from '../../auth/jwt.service.js';
import { sessionEndedException } from '../errors/error-codes.js';

import type { Request, Response, NextFunction } from 'express';

import { UsersService } from '../../users/users.service.js';
import type { User } from '../../users/entities/user.entity.js';

@Injectable()
export class JwtMiddleware implements NestMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    res.statusCode;

    let token = req.cookies['token'] ? `${req.cookies['token']}` : '';

    if (!token) {
      token = `${req.headers['authorization'] || ''}`.split('Bearer ')[1] || '';
    }

    if (!token) {
      throw sessionEndedException();
    }

    try {
      const decoded = this.jwtService.verify(token);
      const user = await this.usersService.findOne(decoded.userId);
      // Copia plana con los datos del usuario (sin métodos de la entidad).
      req.user = { ...user } as User;
      next();
    } catch (error) {
      throw sessionEndedException();
    }
  }
}
