import { type ArgumentsHost, HttpStatus, Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

import { QueryFailedExceptionFilter } from './query-failed-exception.filter.js';

const queryError = (driverError: Record<string, string>) =>
  new QueryFailedError(
    'INSERT INTO ...',
    [],
    Object.assign(new Error('pg'), driverError),
  );

const httpHost = () => {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'POST', url: '/api/v1/zones' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
};

describe('QueryFailedExceptionFilter', () => {
  const filter = new QueryFailedExceptionFilter();
  let logError: jest.SpyInstance;

  beforeEach(() => {
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => logError.mockRestore());

  it('un duplicado de datos responde 409 con un mensaje claro y sin detalles técnicos', () => {
    const { host, response } = httpHost();

    filter.catch(
      queryError({
        code: '23505',
        detail: 'Key (name)=(Almacén) already exists.',
        table: 'zones',
        constraint: 'UQ_zone_name',
      }),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    const body = response.json.mock.calls[0][0];
    expect(body).toEqual({
      statusCode: 409,
      message: 'No se pudo guardar: ya existe un registro con esos datos.',
      error: 'Conflict',
    });
    expect(JSON.stringify(body)).not.toMatch(/zones|UQ_zone_name|Almacén/);
  });

  it('un id duplicado (secuencia desfasada) responde 409 pidiendo avisar al administrador', () => {
    const { host, response } = httpHost();

    filter.catch(
      queryError({
        code: '23505',
        detail: 'Ya existe la llave (id)=(3819).',
      }),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(response.json.mock.calls[0][0].message).toBe(
      'No se pudo guardar el registro. Avise al administrador del sistema.',
    );
  });

  it('cualquier otro error de base de datos responde 500 con un mensaje genérico', () => {
    const { host, response } = httpHost();

    filter.catch(queryError({ code: '23503', table: 'evidence' }), host);

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(response.json.mock.calls[0][0]).toEqual({
      statusCode: 500,
      message:
        'No se pudo completar la operación. Avise al administrador del sistema.',
      error: 'Internal Server Error',
    });
  });

  it('deja el detalle técnico en el log', () => {
    const { host } = httpHost();

    filter.catch(
      queryError({
        code: '23505',
        detail: 'Key (name)=(Almacén) already exists.',
        table: 'zones',
        constraint: 'UQ_zone_name',
      }),
      host,
    );

    const [line] = logError.mock.calls[0];
    expect(line).toContain('POST /api/v1/zones');
    expect(line).toContain('código=23505');
    expect(line).toContain('tabla=zones');
    expect(line).toContain('restricción=UQ_zone_name');
  });

  it('en GraphQL no responde por HTTP: devuelve la excepción para que la maneje GraphQL', () => {
    const switchToHttp = jest.fn();
    const host = {
      getType: () => 'graphql',
      switchToHttp,
    } as unknown as ArgumentsHost;
    const error = queryError({ code: '23505' });

    expect(filter.catch(error, host)).toBe(error);
    expect(switchToHttp).not.toHaveBeenCalled();
  });
});
