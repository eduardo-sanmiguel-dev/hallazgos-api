import {
  buildFileNameTimestamp,
  sanitizeFileNamePart,
} from '../shared/utils/file-name';
import {
  PLANT_TIME_ZONES,
  toPlantCountry,
} from '../shared/utils/storage-timezones';
import { inspectionStoredWallClockToInstant } from './extinguisher-inspection-storage-timezones';

/** Código del formato: siempre al inicio del nombre. */
export const INSPECTION_FORMAT_CODE = 'RGOSGSST49';

interface InspectionFileNameParts {
  id: number;
  plantName?: string | null;
  countryName?: string | null;
  /** createdAt tal como está guardado (texto "YYYY-MM-DD HH:mm:ss[.f]"). */
  storedCreatedAt?: string | null;
}

/**
 * RGOSGSST49_{ID}_{Planta}_{AAAA-MM-DD}_{HHmm}_UTC±HH.xlsx
 *
 * Fecha y hora de CREACIÓN en la zona del país de la planta (Colombia → Bogotá,
 * resto → México), con el desfase de esa fecha: la misma inspección siempre
 * tiene el mismo nombre, sin importar desde dónde se descargue.
 */
export const buildInspectionFileName = ({
  id,
  plantName,
  countryName,
  storedCreatedAt,
}: InspectionFileNameParts) => {
  const country = toPlantCountry(countryName);
  const timestamp = storedCreatedAt
    ? buildFileNameTimestamp(
        PLANT_TIME_ZONES[country],
        inspectionStoredWallClockToInstant(
          'createdAt',
          country,
          storedCreatedAt,
        ),
      )
    : '';

  return `${[
    INSPECTION_FORMAT_CODE,
    String(id),
    sanitizeFileNamePart(plantName ?? '', ''),
    timestamp,
  ]
    .filter(Boolean)
    .join('_')}.xlsx`;
};
