import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from 'auth/jwt.service';

import { Request, Response, NextFunction } from 'express';

import { UsersService } from 'users/users.service';

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
      throw new UnauthorizedException('Credenciales no válidas');
    }

    try {
      const decoded = this.jwtService.verify(token);
      const user = await this.usersService.findOne(decoded.userId);
      req['user'] = { ...user };
      next();
    } catch (error) {
      throw new UnauthorizedException('Credenciales no válidas');
    }
  }
}
