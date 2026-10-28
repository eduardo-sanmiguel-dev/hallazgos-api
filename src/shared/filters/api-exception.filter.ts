import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { STATUS_CODES } from 'http';
import { QueryFailedError } from 'typeorm';
import type { Request, Response } from 'express';

import { type ApiErrorBody, ERROR_CODES } from '../errors/error-codes.js';

const UNIQUE_VIOLATION = '23505';

interface PgDriverError {
  code?: string;
  detail?: string;
  table?: string;
  constraint?: string;
}

/** Código por estatus cuando la excepción no trae uno propio. */
const CODE_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: ERROR_CODES.badRequest,
  [HttpStatus.UNAUTHORIZED]: ERROR_CODES.unauthorized,
  [HttpStatus.FORBIDDEN]: ERROR_CODES.forbidden,
  [HttpStatus.NOT_FOUND]: ERROR_CODES.notFound,
  [HttpStatus.CONFLICT]: ERROR_CODES.conflict,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ERROR_CODES.payloadTooLarge,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ERROR_CODES.unprocessable,
  [HttpStatus.TOO_MANY_REQUESTS]: ERROR_CODES.tooManyRequests,
};

/**
 * Textos en inglés que manda el framework (guards, rutas inexistentes,
 * multer, límite de intentos, pipes) cuando nadie puso uno propio.
 */
const FRAMEWORK_MESSAGES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'La solicitud no es válida.',
  [HttpStatus.UNAUTHORIZED]: 'Inicia sesión para continuar.',
  [HttpStatus.FORBIDDEN]: 'No tienes permiso para realizar esta acción.',
  [HttpStatus.NOT_FOUND]: 'No se encontró lo que buscas.',
  [HttpStatus.CONFLICT]:
    'No se pudo completar porque la información cambió. Recarga e intenta de nuevo.',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'La información enviada es demasiado grande.',
  [HttpStatus.TOO_MANY_REQUESTS]:
    'Demasiados intentos. Espera un minuto e intenta de nuevo.',
};

const isFrameworkMessage = (status: number, message: string) =>
  message === STATUS_CODES[status] ||
  message === 'Forbidden resource' ||
  /^Cannot (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /.test(message) ||
  /^Validation failed/.test(message) ||
  /^ThrottlerException/.test(message) ||
  status === HttpStatus.TOO_MANY_REQUESTS;

// Fotos de evidencia: multer responde 413 "File too large" sobre el límite.
const PHOTO_TOO_LARGE = 'La foto pesa más de 2 MB.';

// Sin 0/O ni 1/I: se dicta por teléfono sin confusiones.
const REF_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Referencia corta del error 500, la misma en la respuesta y en el log. */
export const createErrorRef = () =>
  `E-${Array.from({ length: 6 }, () => REF_ALPHABET[randomInt(REF_ALPHABET.length)]).join('')}`;

export const internalErrorMessage = (ref: string) =>
  `Ocurrió un error inesperado. Intenta de nuevo; si continúa, avisa al administrador con la referencia ${ref}.`;

// Detalle de Postgres: "Ya existe la llave (id)=(3819)." o, en inglés,
// "Key (id)=(3819) already exists.". Solo se usa para el log.
const isDuplicateId = (detail?: string) => /\(id\)=\(/.test(detail ?? '');

interface Described {
  statusCode: number;
  code: string;
  message: string;
  errors?: Record<string, string>;
  /** Solo en 500: texto técnico para el log (nunca va en la respuesta). */
  logDetail?: string;
}

const describeHttpException = (exception: HttpException): Described => {
  const statusCode = exception.getStatus();
  const response = exception.getResponse();
  const body =
    typeof response === 'string'
      ? { message: response }
      : (response as { message?: unknown; code?: string; errors?: unknown });

  const rawMessage = Array.isArray(body.message)
    ? body.message.join(' ')
    : String(body.message ?? exception.message ?? '');

  if (statusCode >= 500) {
    return {
      statusCode,
      code: ERROR_CODES.internalError,
      message: '',
      logDetail: rawMessage,
    };
  }

  let message = rawMessage;
  if (
    statusCode === HttpStatus.PAYLOAD_TOO_LARGE &&
    rawMessage === 'File too large'
  ) {
    message = PHOTO_TOO_LARGE;
  } else if (!rawMessage || isFrameworkMessage(statusCode, rawMessage)) {
    message = FRAMEWORK_MESSAGES[statusCode] ?? FRAMEWORK_MESSAGES[400];
  }

  return {
    statusCode,
    code: body.code ?? CODE_BY_STATUS[statusCode] ?? `HTTP_${statusCode}`,
    message,
    ...(body.errors && typeof body.errors === 'object'
      ? { errors: body.errors as Record<string, string> }
      : {}),
  };
};

// Errores de base de datos que ningún servicio manejó: mensajes en español y
// sin nombres de tablas, columnas ni ids.
const describeQueryFailed = (exception: QueryFailedError): Described => {
  const driverError = (exception.driverError ?? {}) as PgDriverError;
  const logDetail = [
    `código=${driverError.code}`,
    `tabla=${driverError.table ?? '-'}`,
    `restricción=${driverError.constraint ?? '-'}`,
    `detalle=${driverError.detail ?? exception.message}`,
  ].join(' | ');

  if (driverError.code === UNIQUE_VIOLATION) {
    return {
      statusCode: HttpStatus.CONFLICT,
      code: ERROR_CODES.conflict,
      message: isDuplicateId(driverError.detail)
        ? 'No se pudo guardar el registro. Avise al administrador del sistema.'
        : 'No se pudo guardar: ya existe un registro con esos datos.',
      logDetail,
    };
  }

  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    code: ERROR_CODES.internalError,
    message: '',
    logDetail,
  };
};

/**
 * Errores 4xx de Express que no son HttpException: el lector del cuerpo
 * (body-parser) los lanza con `status` y `expose`, por ejemplo un cuerpo de
 * más de 100 KB (413, `entity.too.large`) o un JSON mal formado (400). Antes
 * llegaban como 500 genérico.
 */
interface ClientHttpError {
  status: number;
  expose: boolean;
  type?: string;
  message?: string;
}

const isClientHttpError = (
  exception: unknown,
): exception is ClientHttpError => {
  const error = exception as Partial<ClientHttpError> | null;
  return (
    typeof error?.status === 'number' &&
    error.status >= 400 &&
    error.status < 500 &&
    error.expose === true
  );
};

const describeClientHttpError = (exception: ClientHttpError): Described => ({
  statusCode: exception.status,
  code: CODE_BY_STATUS[exception.status] ?? `HTTP_${exception.status}`,
  message: FRAMEWORK_MESSAGES[exception.status] ?? FRAMEWORK_MESSAGES[400],
});

/**
 * Formato único de error del API REST (ver ApiErrorBody): mensaje en español,
 * código estable y, en validación, errores por campo. Los errores 500 llevan
 * una referencia corta; el detalle técnico queda solo en el log.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    // GraphQL (useEvidences) maneja sus errores por su lado.
    if (host.getType() !== 'http') return exception;

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const described =
      exception instanceof HttpException
        ? describeHttpException(exception)
        : exception instanceof QueryFailedError
          ? describeQueryFailed(exception)
          : isClientHttpError(exception)
            ? describeClientHttpError(exception)
            : {
                statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                code: ERROR_CODES.internalError,
                message: '',
                logDetail: (exception as Error)?.message ?? String(exception),
              };

    const { statusCode, code, errors, logDetail } = described;
    const isInternal = statusCode >= 500;
    const ref = isInternal ? createErrorRef() : undefined;
    const where = `${request.method} ${request.originalUrl ?? request.url}`;
    const userId = (request.user as { id?: number } | undefined)?.id ?? '-';

    if (isInternal) {
      this.logger.error(
        `ref=${ref} | ${where} | usuario=${userId} | ${logDetail}`,
        (exception as Error)?.stack,
      );
    } else if (logDetail) {
      // Duplicados de base de datos (409): se avisa al usuario y el detalle
      // técnico queda en el log, como antes.
      this.logger.error(`${where} | ${logDetail}`, (exception as Error)?.stack);
    }

    if (response.headersSent) return;

    const body: ApiErrorBody = {
      statusCode,
      code,
      message: isInternal ? internalErrorMessage(ref!) : described.message,
      error: STATUS_CODES[statusCode] ?? 'Error',
      ...(errors ? { errors } : {}),
      ...(ref ? { ref } : {}),
    };

    response.status(statusCode).json(body);
  }
}
