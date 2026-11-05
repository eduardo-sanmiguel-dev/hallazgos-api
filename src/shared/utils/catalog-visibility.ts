import { ForbiddenException } from '@nestjs/common';
import { RequestContextService } from '../services/request-context.service.js';

/** RequestContextService is a stateless accessor to the current AsyncLocalStorage. */
export function catalogIncludesInactive(value?: string | boolean): boolean {
  if (value !== 'true' && value !== true) return false;
  if (!new RequestContextService().isAdmin)
    throw new ForbiddenException(
      'Solo un administrador puede consultar registros inactivos de configuración.',
    );
  return true;
}
