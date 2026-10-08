import {
  PLANT_TIME_ZONES,
  PlantCountry,
  SERVER_TZ_TO_MEXICO_CUT,
  StorageTimeZoneRules,
  resolveStoredInstant,
} from '../shared/utils/storage-timezones';

/*
 * Zona en la que quedó guardada la hora de pared de las columnas
 * "timestamp without time zone" de extinguisher_inspections.
 * Misma estructura que evidences/evidence-storage-timezones.ts.
 *
 * Evidencia (análisis de solo lectura sobre una copia de producción del 2026-10-08):
 *
 * - El módulo se creó en el commit 0225668 (2026-04-08), después del cambio de
 *   TZ de Node en producción (UTC → America/Mexico_City, 2026-02-23..26). La
 *   inspección más antigua es del 2026-04-21: no hay filas guardadas en UTC.
 * - create() escribe createdAt con `new Date()` (reloj de Node) para todas las
 *   plantas; nunca usó getColombiaNow() (git log -S getColombiaNow sin
 *   resultados en el módulo). Por eso Colombia también está en hora de México.
 * - Reloj pareado: updatedAt lo pone Postgres (@UpdateDateColumn, microsegundos,
 *   sesión en America/Mexico_City) en el mismo INSERT que createdAt (Node,
 *   milisegundos): desfase 0 h en las 13 filas comparables, de México y de
 *   Colombia. La fila 1 (2026-04-21 21:38:39.861577) tiene ambos valores del
 *   reloj de Postgres (now()), también en hora de México.
 *
 * Si alguna vez create() pasa a usar otra zona, agrega un tramo con `until`.
 */

export type InspectionStoredDateColumn = 'createdAt';

const UTC = 'UTC';
const MEXICO = PLANT_TIME_ZONES.MX;

export const EXTINGUISHER_INSPECTION_STORAGE_TIME_ZONES: StorageTimeZoneRules<InspectionStoredDateColumn> =
  {
    createdAt: [
      // Node en UTC (historia del servidor). Hoy no hay filas en este tramo:
      // el módulo no existía; se deja para que la regla sea correcta si las hubiera.
      { until: SERVER_TZ_TO_MEXICO_CUT, zones: { MX: UTC, CO: UTC } },
      // Node en America/Mexico_City y new Date() para todas las plantas.
      { until: null, zones: { MX: MEXICO, CO: MEXICO } },
    ],
  };

/** Convierte el texto guardado al instante real según la tabla de cortes. */
export const inspectionStoredWallClockToInstant = (
  column: string,
  country: PlantCountry,
  storedValue: string,
): Date =>
  resolveStoredInstant(
    EXTINGUISHER_INSPECTION_STORAGE_TIME_ZONES,
    'EXTINGUISHER_INSPECTION_STORAGE_TIME_ZONES',
    column,
    country,
    storedValue,
  );
