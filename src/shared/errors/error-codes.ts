import { UnauthorizedException } from '@nestjs/common';

/**
 * Códigos estables del cuerpo de error (`code`). La UI decide el título del
 * aviso y la acción con ellos; el texto (`message`) puede cambiar, el código
 * no.
 */
export const ERROR_CODES = {
  validationFailed: 'VALIDATION_FAILED',
  badRequest: 'BAD_REQUEST',
  unauthorized: 'UNAUTHORIZED',
  invalidCredentials: 'INVALID_CREDENTIALS',
  sessionExpired: 'SESSION_EXPIRED',
  forbidden: 'FORBIDDEN',
  notFound: 'NOT_FOUND',
  conflict: 'CONFLICT',
  payloadTooLarge: 'PAYLOAD_TOO_LARGE',
  unprocessable: 'UNPROCESSABLE_ENTITY',
  tooManyRequests: 'TOO_MANY_REQUESTS',
  internalError: 'INTERNAL_ERROR',
  idempotencyInProgress: 'IDEMPOTENCY_IN_PROGRESS',
  idempotencyUnconfirmed: 'IDEMPOTENCY_UNCONFIRMED',
  idempotencyKeyMismatch: 'IDEMPOTENCY_KEY_MISMATCH',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Cuerpo de todas las respuestas de error del API REST. */
export interface ApiErrorBody {
  statusCode: number;
  code: string;
  /** Siempre texto en español (antes, en validaciones, era un arreglo). */
  message: string;
  /** Texto del estatus HTTP ("Bad Request"); se conserva por compatibilidad. */
  error: string;
  /** Solo en validación: ruta del campo → mensaje (sin la etiqueta). */
  errors?: Record<string, string>;
  /** Solo en errores 500: referencia que también queda en el log. */
  ref?: string;
}

/**
 * Cuerpo para una HttpException con código propio:
 *   throw new UnauthorizedException(apiError(SESSION_ENDED, ERROR_CODES.sessionExpired));
 */
export const apiError = (message: string, code: ErrorCode) => ({
  message,
  code,
});

export const SESSION_ENDED_MESSAGE =
  'Tu sesión terminó. Inicia sesión de nuevo.';

/**
 * 401 de una petición sin sesión válida: sin token, token vencido o usuario
 * desactivado. La UI avisa antes de mandar al login (no lo confunde con una
 * contraseña equivocada, que es INVALID_CREDENTIALS).
 */
export const sessionEndedException = () =>
  new UnauthorizedException(
    apiError(SESSION_ENDED_MESSAGE, ERROR_CODES.sessionExpired),
  );
