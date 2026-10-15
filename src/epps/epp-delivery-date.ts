import {
  PLANT_TIME_ZONES,
  toPlantCountry,
} from '../shared/utils/storage-timezones';
import { toWallClock } from '../shared/utils/timezone';

/**
 * Fecha de entrega de EPP: el día local de la planta (México o Bogotá según
 * su país) en el instante de la entrega.
 *
 * deliveryDate es una columna `date` y el transformer de la entidad la guarda
 * con toISOString().slice(0, 10), es decir, el día en UTC. Con new Date(), una
 * entrega a las 18:00 o más tarde en México (19:00 en Bogotá) quedaba con el
 * día siguiente. Por eso se devuelve la medianoche UTC del día local: el
 * transformer guarda exactamente ese día.
 */
export const plantDeliveryDate = (
  instant: Date,
  countryName?: string | null,
): Date => {
  const timeZone = PLANT_TIME_ZONES[toPlantCountry(countryName)];
  const { year, month, day } = toWallClock(instant, timeZone);

  return new Date(Date.UTC(year, month - 1, day));
};
