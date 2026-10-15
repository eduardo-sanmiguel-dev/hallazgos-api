import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import type { Request, Response } from 'express';

const UNIQUE_VIOLATION = '23505';

interface PgDriverError {
  code?: string;
  detail?: string;
  table?: string;
  constraint?: string;
}

// Detalle de Postgres: "Ya existe la llave (id)=(3819)." o, en inglés,
// "Key (id)=(3819) already exists.". Solo se usa para el log.
const isDuplicateId = (detail?: string) => /\(id\)=\(/.test(detail ?? '');

// Mensajes para el usuario: en español y sin nombres de tablas, columnas ni
// ids. El detalle técnico queda en el log de la API.
const userMessage = ({ code, detail }: PgDriverError) => {
  if (code === UNIQUE_VIOLATION && !isDuplicateId(detail)) {
    return 'No se pudo guardar: ya existe un registro con esos datos.';
  }

  if (code === UNIQUE_VIOLATION) {
    return 'No se pudo guardar el registro. Avise al administrador del sistema.';
  }

  return 'No se pudo completar la operación. Avise al administrador del sistema.';
};

// Errores de base de datos que ningún servicio manejó. Antes llegaban al
// usuario como "Internal server error" sin más detalle.
@Catch(QueryFailedError)
export class QueryFailedExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('QueryFailedExceptionFilter');

  catch(exception: QueryFailedError, host: ArgumentsHost) {
    // GraphQL (useEvidences) maneja sus errores por su lado.
    if (host.getType() !== 'http') return exception;

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const driverError = (exception.driverError ?? {}) as PgDriverError;

    this.logger.error(
      [
        `${request.method} ${request.url}`,
        `código=${driverError.code}`,
        `tabla=${driverError.table ?? '-'}`,
        `restricción=${driverError.constraint ?? '-'}`,
        `detalle=${driverError.detail ?? exception.message}`,
      ].join(' | '),
      exception.stack,
    );

    const isUniqueViolation = driverError.code === UNIQUE_VIOLATION;
    const statusCode = isUniqueViolation
      ? HttpStatus.CONFLICT
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = userMessage(driverError);

    response.status(statusCode).json({
      statusCode,
      message,
      error: isUniqueViolation ? 'Conflict' : 'Internal Server Error',
    });
  }
}
