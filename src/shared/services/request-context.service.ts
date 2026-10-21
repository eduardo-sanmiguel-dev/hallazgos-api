import { AsyncLocalStorage } from 'async_hooks';

import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { ROLE_ADMINISTRADOR } from '../constants/index.js';
import type { User } from '../../users/entities/user.entity.js';

// JwtMiddleware deja el usuario autenticado en req.user.
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

const storage = new AsyncLocalStorage<Request>();

/**
 * Único punto de acceso a la petición HTTP actual y al usuario en sesión.
 *
 * Los servicios son singleton: la petición vive en AsyncLocalStorage, que
 * RequestContextMiddleware abre al inicio de cada petición. Cada petición
 * tiene su propio contexto, así que peticiones concurrentes nunca ven el
 * usuario de otra.
 *
 * Regla: leer siempre desde aquí en el momento de usarlo; nunca guardar el
 * usuario en propiedades de un servicio (son compartidos entre peticiones).
 */
@Injectable()
export class RequestContextService {
  static run(request: Request, callback: () => void) {
    storage.run(request, callback);
  }

  get request(): Request {
    const request = storage.getStore();

    if (!request) {
      throw new Error(
        'No hay una petición activa: RequestContextService solo funciona dentro de una petición HTTP',
      );
    }

    return request;
  }

  /** Usuario en sesión o null (rutas públicas). */
  get userOrNull(): User | null {
    return this.request.user ?? null;
  }

  /** Usuario en sesión; 401 si la petición no está autenticada. */
  get user(): User {
    const user = this.userOrNull;

    if (!user) {
      throw new UnauthorizedException('Credenciales no válidas');
    }

    return user;
  }

  get userId(): number {
    return this.user.id;
  }

  assertManufacturingPlant(id: number): number {
    const plantId = Number(id);
    if (
      !Number.isInteger(plantId) ||
      !this.manufacturingPlantIds.includes(plantId)
    ) {
      throw new NotFoundException('Planta no encontrada');
    }
    return plantId;
  }

  get isAdmin(): boolean {
    return this.user.role === ROLE_ADMINISTRADOR;
  }

  /** Ids de las plantas asignadas al usuario en sesión. */
  get manufacturingPlantIds(): number[] {
    return (this.user.manufacturingPlants ?? []).map(({ id }) => id);
  }
}
