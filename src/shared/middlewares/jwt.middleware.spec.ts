import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import jwt from 'jsonwebtoken';

import { JwtService } from '../../auth/jwt.service.js';
import { buildUser } from '../../../test/utils/index.js';
import { User } from '../../users/entities/user.entity.js';
import { UsersService } from '../../users/users.service.js';
import { JwtMiddleware } from './jwt.middleware.js';

const SECRET = 'secreto-de-pruebas';

describe('JwtMiddleware', () => {
  const jwtService = new JwtService({
    get: () => SECRET,
  } as unknown as ConfigService);
  let usersService: { findOne: jest.Mock };
  let middleware: JwtMiddleware;

  beforeEach(() => {
    usersService = { findOne: jest.fn() };
    middleware = new JwtMiddleware(
      jwtService,
      usersService as unknown as UsersService,
    );
  });

  const request = ({
    cookie,
    authorization,
  }: {
    cookie?: string;
    authorization?: string;
  }) =>
    ({
      cookies: cookie ? { token: cookie } : {},
      headers: authorization ? { authorization } : {},
    }) as unknown as Request;
  const response = {} as Response;

  it('autentica con el token de la cookie y guarda el usuario en la petición', async () => {
    const user = Object.assign(new User(), buildUser({ id: 7 }));
    usersService.findOne.mockResolvedValue(user);
    const req = request({ cookie: jwtService.create(7) });
    const next = jest.fn();

    await middleware.use(req, response, next);

    expect(usersService.findOne).toHaveBeenCalledWith(7);
    expect(req.user).toMatchObject({ id: 7, email: user.email });
    // Copia plana: sin los métodos de la entidad.
    expect(req.user).not.toBeInstanceOf(User);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('acepta el token en el header Authorization: Bearer', async () => {
    usersService.findOne.mockResolvedValue(buildUser({ id: 9 }));
    const req = request({ authorization: `Bearer ${jwtService.create(9)}` });
    const next = jest.fn();

    await middleware.use(req, response, next);

    expect(req.user).toMatchObject({ id: 9 });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('la cookie tiene prioridad sobre el header', async () => {
    usersService.findOne.mockResolvedValue(buildUser({ id: 7 }));
    const req = request({
      cookie: jwtService.create(7),
      authorization: `Bearer ${jwtService.create(9)}`,
    });

    await middleware.use(req, response, jest.fn());

    expect(usersService.findOne).toHaveBeenCalledWith(7);
  });

  it.each([
    ['sin token', {}],
    ['con Authorization sin "Bearer "', { authorization: 'Token abc' }],
  ])('debe lanzar UnauthorizedException %s', async (_case, input) => {
    const next = jest.fn();

    await expect(
      middleware.use(request(input), response, next),
    ).rejects.toThrow(new UnauthorizedException('Credenciales no válidas'));
    expect(next).not.toHaveBeenCalled();
    expect(usersService.findOne).not.toHaveBeenCalled();
  });

  it.each([
    ['inválido', 'no-es-un-jwt'],
    [
      'vencido',
      jwt.sign({ userId: 7 }, SECRET, { algorithm: 'HS256', expiresIn: -10 }),
    ],
    ['firmado con otra clave', jwt.sign({ userId: 7 }, 'otra-clave')],
  ])('debe lanzar UnauthorizedException con un token %s', async (_c, token) => {
    const next = jest.fn();

    await expect(
      middleware.use(request({ cookie: token }), response, next),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(next).not.toHaveBeenCalled();
  });

  it('debe lanzar UnauthorizedException si el usuario del token ya no existe o está inactivo', async () => {
    usersService.findOne.mockRejectedValue(new NotFoundException());
    const next = jest.fn();

    await expect(
      middleware.use(request({ cookie: jwtService.create(7) }), response, next),
    ).rejects.toThrow(new UnauthorizedException('Credenciales no válidas'));
    expect(next).not.toHaveBeenCalled();
  });
});
