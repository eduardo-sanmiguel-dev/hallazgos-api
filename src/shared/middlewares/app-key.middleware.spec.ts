import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import { AppKeyMiddleware } from './app-key.middleware.js';

describe('AppKeyMiddleware', () => {
  const middleware = new AppKeyMiddleware({
    get: () => 'clave-app',
  } as unknown as ConfigService);

  const requestWith = (headers: Record<string, string>) =>
    ({ headers }) as unknown as Request;
  const response = {} as Response;

  it('deja pasar la petición con la API key correcta', () => {
    const next = jest.fn();

    middleware.use(requestWith({ 'x-app-key': 'clave-app' }), response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('debe lanzar BadRequestException si falta el header x-app-key', () => {
    const next = jest.fn();

    expect(() => middleware.use(requestWith({}), response, next)).toThrow(
      new BadRequestException('API Key es requerido'),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('debe lanzar BadRequestException si la API key no coincide', () => {
    const next = jest.fn();

    expect(() =>
      middleware.use(requestWith({ 'x-app-key': 'otra' }), response, next),
    ).toThrow(new BadRequestException('API Key es inválido'));
    expect(next).not.toHaveBeenCalled();
  });
});
