import {
  type ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { QueryFailedError } from 'typeorm';

import { sessionEndedException } from '../errors/error-codes.js';
import { ApiExceptionFilter } from './api-exception.filter.js';

const queryError = (driverError: Record<string, string>) =>
  new QueryFailedError(
    'INSERT INTO ...',
    [],
    Object.assign(new Error('pg'), driverError),
  );

const httpHost = (user?: { id: number }) => {
  const response = {
    headersSent: false,
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({
        method: 'POST',
        url: '/api/v1/zones',
        originalUrl: '/api/v1/zones',
        user,
      }),
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
};

const REF = /^E-[2-9A-HJ-NP-Z]{6}$/;

describe('ApiExceptionFilter', () => {
  const filter = new ApiExceptionFilter();
  let logError: jest.SpyInstance;

  beforeEach(() => {
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => logError.mockRestore());

  const respond = (exception: unknown, user?: { id: number }) => {
    const { host, response } = httpHost(user);
    filter.catch(exception, host);
    return {
      status: response.status.mock.calls[0][0],
      body: response.json.mock.calls[0][0],
    };
  };

  describe('errores HTTP', () => {
    it('conserva el mensaje del servicio y agrega el código por estatus', () => {
      expect(
        respond(new NotFoundException('Area con ID 4 no encontrado')),
      ).toEqual({
        status: 404,
        body: {
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Area con ID 4 no encontrado',
          error: 'Not Found',
        },
      });
    });

    it('validación: conserva el código y los errores por campo', () => {
      const { body } = respond(
        new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Zona: dato obligatorio.',
          errors: { zone: 'Dato obligatorio.' },
        }),
      );

      expect(body).toEqual({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: 'Zona: dato obligatorio.',
        error: 'Bad Request',
        errors: { zone: 'Dato obligatorio.' },
      });
    });

    it('sesión terminada: 401 con SESSION_EXPIRED', () => {
      expect(respond(sessionEndedException()).body).toMatchObject({
        statusCode: 401,
        code: 'SESSION_EXPIRED',
        message: 'Tu sesión terminó. Inicia sesión de nuevo.',
      });
    });

    it.each([
      [
        'guard sin permiso',
        new ForbiddenException(),
        'No tienes permiso para realizar esta acción.',
      ],
      [
        'guard que devuelve false',
        new ForbiddenException('Forbidden resource'),
        'No tienes permiso para realizar esta acción.',
      ],
      [
        'ruta inexistente',
        new NotFoundException('Cannot POST /api/v1/nada'),
        'No se encontró lo que buscas.',
      ],
      [
        'foto sobre el límite de multer',
        new PayloadTooLargeException('File too large'),
        'La foto pesa más de 2 MB.',
      ],
      [
        'límite de intentos del login',
        new ThrottlerException(),
        'Demasiados intentos. Espera un minuto e intenta de nuevo.',
      ],
      [
        'ParseIntPipe',
        new BadRequestException(
          'Validation failed (numeric string is expected)',
        ),
        'La solicitud no es válida.',
      ],
    ])(
      'traduce el texto en inglés del framework: %s',
      (_case, error, message) => {
        expect(respond(error).body.message).toBe(message);
      },
    );

    it('un arreglo de mensajes (pipes propios) llega como un solo texto', () => {
      expect(
        respond(new BadRequestException(['Uno.', 'Dos.'])).body.message,
      ).toBe('Uno. Dos.');
    });
  });

  describe('errores del lector del cuerpo (body-parser)', () => {
    // Express los lanza con status y expose, sin ser HttpException.
    const bodyParserError = (status: number, type: string) =>
      Object.assign(new Error('request entity too large'), {
        status,
        statusCode: status,
        expose: true,
        type,
      });

    it('un cuerpo de más del límite responde 413 en español, no 500', () => {
      const { status, body } = respond(
        bodyParserError(413, 'entity.too.large'),
      );

      expect(status).toBe(413);
      expect(body).toEqual({
        statusCode: 413,
        code: 'PAYLOAD_TOO_LARGE',
        message: 'La información enviada es demasiado grande.',
        error: 'Payload Too Large',
      });
      expect(logError).not.toHaveBeenCalled();
    });

    it('un JSON mal formado responde 400', () => {
      const { status, body } = respond(
        bodyParserError(400, 'entity.parse.failed'),
      );

      expect(status).toBe(400);
      expect(body).toMatchObject({
        code: 'BAD_REQUEST',
        message: 'La solicitud no es válida.',
      });
    });

    // Desde @nestjs/platform-express 12.3 el adaptador los envuelve: el 413
    // llega como HttpException con el original en `cause`, y el JSON mal
    // formado como BadRequestException con el texto de JSON.parse.
    it('envuelto por Nest (cause): el 413 sigue en español', () => {
      const { status, body } = respond(
        new HttpException('request entity too large', 413, {
          cause: bodyParserError(413, 'entity.too.large'),
        }),
      );

      expect(status).toBe(413);
      expect(body).toMatchObject({
        code: 'PAYLOAD_TOO_LARGE',
        message: 'La información enviada es demasiado grande.',
      });
    });

    it.each([
      'Expected double-quoted property name in JSON at position 17 (line 1 column 18)',
      'Unexpected token } in JSON at position 1',
      'Unexpected end of JSON input',
      `Unexpected token 'x', "x" is not valid JSON`,
    ])(
      'JSON mal formado convertido por Nest ("%s"): 400 en español',
      (text) => {
        const { status, body } = respond(new BadRequestException(text));

        expect(status).toBe(400);
        expect(body).toMatchObject({
          code: 'BAD_REQUEST',
          message: 'La solicitud no es válida.',
        });
      },
    );

    it('un 400 propio que menciona JSON conserva su mensaje', () => {
      const { body } = respond(
        new BadRequestException(
          'El archivo JSON de la plantilla no es válido.',
        ),
      );

      expect(body.message).toBe(
        'El archivo JSON de la plantilla no es válido.',
      );
    });

    it('un error con status 5xx o sin expose sigue siendo 500 con referencia', () => {
      const { status, body } = respond(
        Object.assign(new Error('x'), { status: 413, expose: false }),
      );

      expect(status).toBe(500);
      expect(body.ref).toMatch(REF);
    });
  });

  describe('errores 500', () => {
    it('mensaje genérico con referencia; el detalle solo en el log con la misma referencia', () => {
      const { status, body } = respond(
        new TypeError("Cannot read properties of undefined (reading 'id')"),
        { id: 12 },
      );

      expect(status).toBe(500);
      expect(body.code).toBe('INTERNAL_ERROR');
      expect(body.ref).toMatch(REF);
      expect(body.message).toBe(
        `Ocurrió un error inesperado. Intenta de nuevo; si continúa, avisa al administrador con la referencia ${body.ref}.`,
      );
      expect(JSON.stringify(body)).not.toMatch(/properties|undefined/);

      const [line, stack] = logError.mock.calls[0];
      expect(line).toContain(`ref=${body.ref}`);
      expect(line).toContain('POST /api/v1/zones');
      expect(line).toContain('usuario=12');
      expect(line).toContain(
        "Cannot read properties of undefined (reading 'id')",
      );
      expect(stack).toContain('TypeError');
    });

    it('una HttpException 5xx tampoco muestra su texto al usuario', () => {
      const { body } = respond(
        new InternalServerErrorException('detalle interno'),
      );

      expect(body.message).not.toContain('detalle interno');
      expect(body.ref).toMatch(REF);
      expect(logError.mock.calls[0][0]).toContain('detalle interno');
    });

    it('cada error tiene su propia referencia', () => {
      const refs = new Set(
        Array.from({ length: 20 }, () => respond(new Error('x')).body.ref),
      );
      expect(refs.size).toBe(20);
    });
  });

  describe('errores de base de datos', () => {
    it('un duplicado de datos responde 409 con un mensaje claro y sin detalles técnicos', () => {
      const { status, body } = respond(
        queryError({
          code: '23505',
          detail: 'Key (name)=(Almacén) already exists.',
          table: 'zones',
          constraint: 'UQ_zone_name',
        }),
      );

      expect(status).toBe(HttpStatus.CONFLICT);
      expect(body).toEqual({
        statusCode: 409,
        code: 'CONFLICT',
        message: 'No se pudo guardar: ya existe un registro con esos datos.',
        error: 'Conflict',
      });
      expect(JSON.stringify(body)).not.toMatch(/zones|UQ_zone_name|Almacén/);
    });

    it('un id duplicado (secuencia desfasada) responde 409 pidiendo avisar al administrador', () => {
      const { status, body } = respond(
        queryError({
          code: '23505',
          detail: 'Ya existe la llave (id)=(3819).',
        }),
      );

      expect(status).toBe(HttpStatus.CONFLICT);
      expect(body.message).toBe(
        'No se pudo guardar el registro. Avise al administrador del sistema.',
      );
    });

    it('cualquier otro error de base de datos responde 500 con referencia', () => {
      const { status, body } = respond(
        queryError({ code: '23503', table: 'evidence' }),
      );

      expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(body.code).toBe('INTERNAL_ERROR');
      expect(body.ref).toMatch(REF);
      expect(JSON.stringify(body)).not.toContain('evidence');
    });

    it('deja el detalle técnico en el log', () => {
      respond(
        queryError({
          code: '23505',
          detail: 'Key (name)=(Almacén) already exists.',
          table: 'zones',
          constraint: 'UQ_zone_name',
        }),
      );

      const [line] = logError.mock.calls[0];
      expect(line).toContain('POST /api/v1/zones');
      expect(line).toContain('código=23505');
      expect(line).toContain('tabla=zones');
      expect(line).toContain('restricción=UQ_zone_name');
    });
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

  it('si la respuesta ya se envió (descarga a medias) solo registra el error', () => {
    const { host, response } = httpHost();
    response.headersSent = true;

    filter.catch(new Error('stream cortado'), host);

    expect(response.status).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalled();
  });
});
