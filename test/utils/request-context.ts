import type { Request } from 'express';

import { RequestContextService } from '../../src/shared/services/request-context.service.js';
import { User } from '../../src/users/entities/user.entity.js';

/**
 * Ejecuta `fn` dentro de una petición simulada, usando el
 * RequestContextService real (mismas reglas de 401, rol y plantas que en
 * producción).
 */
export const runInRequest = <T>(
  request: Partial<Request>,
  fn: () => T | Promise<T>,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const fullRequest = { headers: {}, ...request } as Request;
    RequestContextService.run(fullRequest, () => {
      Promise.resolve().then(fn).then(resolve, reject);
    });
  });

/** Como runInRequest, con `user` en sesión (`null` = petición sin sesión). */
export const runAsUser = <T>(
  user: User | null,
  fn: () => T | Promise<T>,
): Promise<T> => runInRequest({ user: user ?? undefined }, fn);
