import {
  BadRequestException,
  Injectable,
  NotFoundException,
  type PipeTransform,
} from '@nestjs/common';

import { RequestContextService } from '../services/request-context.service.js';
import { scopePlantIds } from '../utils/plant-scope.js';

const isMissing = (value: unknown) =>
  value === undefined || value === null || value === '';

/**
 * Valida un `manufacturingPlantId` recibido del cliente: obligatorio, entero
 * positivo y de una de las plantas del usuario en sesión.
 *
 * - Falta o no es válido: 400 (mismo mensaje que daban los servicios).
 * - Planta ajena: 404, sin revelar si la planta existe.
 *
 * Devuelve el id como número, listo para el servicio.
 *
 *   @Query('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number
 */
@Injectable()
export class UserPlantPipe implements PipeTransform<unknown, number> {
  constructor(private readonly requestContext: RequestContextService) {}

  transform(value: unknown): number {
    const plantId = Number(value);

    if (isMissing(value) || !Number.isInteger(plantId) || plantId <= 0) {
      throw new BadRequestException('manufacturingPlantId es obligatorio');
    }

    const [allowed] = scopePlantIds(
      this.requestContext.user.manufacturingPlants,
      plantId,
    );

    if (!allowed) {
      throw new NotFoundException(`Planta #${plantId} no encontrada`);
    }

    return allowed;
  }
}

/**
 * Igual que `UserPlantPipe`, pero para filtros opcionales: si no llega (o
 * llega vacío) devuelve `undefined` y el servicio usa todas las plantas del
 * usuario. Si llega, se valida igual (400 inválida, 404 ajena).
 */
@Injectable()
export class OptionalUserPlantPipe implements PipeTransform<
  unknown,
  number | undefined
> {
  private readonly required: UserPlantPipe;

  constructor(requestContext: RequestContextService) {
    this.required = new UserPlantPipe(requestContext);
  }

  transform(value: unknown): number | undefined {
    return isMissing(value) ? undefined : this.required.transform(value);
  }
}
