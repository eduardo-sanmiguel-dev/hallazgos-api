import {
  PLANT_TIME_ZONES,
  PlantCountry,
  SERVER_TZ_TO_MEXICO_CUT,
  StorageTimeZoneRules,
  assertStorageRuleColumn,
  resolveStorageTimeZone,
  resolveStoredInstant,
  toPlantCountry,
} from '../shared/utils/storage-timezones';

/*
 * Zona en la que quedó guardada la hora de pared de las columnas
 * "timestamp without time zone" de evidence.
 *
 * Esas columnas no guardan zona: guardan la hora de pared que escribió Node.
 * Esa hora dependió de (a) la TZ del proceso de Node en producción y
 * (b) si el código usaba getColombiaNow() (hora de pared de Bogotá) o new Date().
 * Ambas cosas cambiaron con el tiempo, así que la regla es una tabla de cortes
 * por columna y por país de la planta.
 *
 * Los cortes se comparan contra la hora de pared GUARDADA (texto). Cada corte
 * cae en un hueco sin registros, por eso no hay ambigüedad en la frontera.
 *
 * Evidencia (análisis de solo lectura sobre una copia de producción del 2026-10-07):
 *
 * - Node de producción corrió en UTC hasta 2026-02-23..26 y desde entonces en
 *   America/Mexico_City. Postgres siempre estuvo en America/Mexico_City.
 *   · evidence.updatedAt lo llena Postgres (CURRENT_TIMESTAMP) y solutionDate
 *     Node en el mismo save: updatedAt - solutionDate = -6 h en 2,149 filas
 *     hasta 2026-02-23 19:45 y 0 h en 663 filas desde 2026-02-26 06:34.
 *   · comments.createdAt es timestamptz y addComment escribe evidence.updatedAt
 *     = new Date() en el mismo instante: desfase de Node 0 h hasta 2026-02-09 y
 *     -6 h desde 2026-03-18. epp, equipment_cost_history y training_guide
 *     (timestamptz vs. sin zona) dan -6 h desde 2026-03-05.
 *   · La ventana coincide con los commits del 2026-02-25 que crearon
 *     ecosystem.config.js (PM2): 0ff72b0, 074895b.
 *   · Antes de feb-2026, 0 de 404 hallazgos de México tenían hora 07-13
 *     (serían 01-07 h en México); después, 90 de 237.
 * - createdAt de plantas de Colombia usa getColombiaNow() desde el commit
 *   dde2a17, push 2026-02-05 09:28 (México). getColombiaNow() guarda sin
 *   milisegundos: las 609 filas de Colombia posteriores al corte no tienen ms y
 *   las 2,279 anteriores sí (huella sin traslapes).
 * - solutionDate usa getColombiaNow() desde el commit c0e5006, push
 *   2026-04-06 09:36 (México). Misma huella: 590 filas posteriores sin ms.
 *
 * Casos documentados (se convierten igual que los demás, sin casos especiales):
 * - Hallazgo 2879 (México, createdAt 2026-02-25 18:32:42) cae dentro de la
 *   ventana del cambio de TZ; se toma como hora de México (decisión del negocio).
 * - 321 hallazgos sembrados (ids 3176-3496, Hada International) tienen
 *   createdAt fijo '2026-05-04 09:00:00' puesto por evidences-seed.service.ts.
 * - 72 hallazgos con createdAt '2024-05-17 10:48:46.619667' (microsegundos de
 *   now() de Postgres, probablemente al crear la columna): no es una hora real.
 */

export type EvidenceCountry = PlantCountry;

export type StoredDateColumn = 'createdAt' | 'solutionDate';

const UTC = 'UTC';
const MEXICO = PLANT_TIME_ZONES.MX;
const BOGOTA = PLANT_TIME_ZONES.CO;

const SERVER_TZ_CUT = SERVER_TZ_TO_MEXICO_CUT;

export const EVIDENCE_STORAGE_TIME_ZONES: StorageTimeZoneRules<StoredDateColumn> =
  {
    createdAt: [
      // Node en UTC y new Date() para todas las plantas.
      // Última fila de Colombia en UTC: 2026-01-30 01:19; primera en Bogotá: 2026-02-18 10:29.
      { until: '2026-02-05 10:28:00', zones: { MX: UTC, CO: UTC } },
      // dde2a17: Colombia pasa a getColombiaNow() (hora de Bogotá). Node sigue en UTC.
      // Última fila de México en UTC: 2026-02-11 00:42; siguiente: id 2879 (2026-02-25 18:32).
      { until: SERVER_TZ_CUT, zones: { MX: UTC, CO: BOGOTA } },
      // Node en America/Mexico_City.
      { until: null, zones: { MX: MEXICO, CO: BOGOTA } },
    ],
    solutionDate: [
      // Node en UTC y new Date() para todas las plantas.
      // Última fila en UTC: 2026-02-23 19:45; primera en hora de México: 2026-02-26 06:34.
      { until: SERVER_TZ_CUT, zones: { MX: UTC, CO: UTC } },
      // Node en America/Mexico_City y todavía new Date() también para Colombia.
      // Última fila de Colombia así: 2026-04-01 09:01; primera en Bogotá: 2026-04-07 07:56.
      { until: '2026-04-06 09:36:00', zones: { MX: MEXICO, CO: MEXICO } },
      // c0e5006: Colombia pasa a getColombiaNow().
      { until: null, zones: { MX: MEXICO, CO: BOGOTA } },
    ],
  };

const RULES_NAME = 'EVIDENCE_STORAGE_TIME_ZONES';

export const toEvidenceCountry = toPlantCountry;

/** Falla si la columna no está en la tabla: nunca se asume una zona. */
export function assertStoredDateColumn(
  column: string,
): asserts column is StoredDateColumn {
  assertStorageRuleColumn(EVIDENCE_STORAGE_TIME_ZONES, RULES_NAME, column);
}

/** Zona en la que está guardada `storedValue` (texto "YYYY-MM-DD HH:mm:ss[.f]"). */
export const getStorageTimeZone = (
  column: string,
  country: EvidenceCountry,
  storedValue: string,
): string =>
  resolveStorageTimeZone(
    EVIDENCE_STORAGE_TIME_ZONES,
    RULES_NAME,
    column,
    country,
    storedValue,
  );

/** Convierte el texto guardado al instante real según la tabla de cortes. */
export const storedWallClockToInstant = (
  column: string,
  country: EvidenceCountry,
  storedValue: string,
): Date =>
  resolveStoredInstant(
    EVIDENCE_STORAGE_TIME_ZONES,
    RULES_NAME,
    column,
    country,
    storedValue,
  );
