import { parseWallClock, wallClockToInstant } from './timezone';

/*
 * Resolución genérica de "en qué zona quedó guardada" una columna
 * "timestamp without time zone". Cada tabla define su propia regla
 * (tabla de cortes con la evidencia comentada) en su módulo, por ejemplo
 * evidences/evidence-storage-timezones.ts.
 */

export type PlantCountry = 'MX' | 'CO';

export const COLOMBIA_COUNTRY_NAME = 'Colombia';

/** Zona horaria con la que se muestra una fecha fuera del navegador, por país de la planta. */
export const PLANT_TIME_ZONES: Record<PlantCountry, string> = {
  MX: 'America/Mexico_City',
  CO: 'America/Bogota',
};

/**
 * Node de producción corrió en UTC hasta 2026-02-23..26 y desde entonces en
 * America/Mexico_City (evidencia en evidences/evidence-storage-timezones.ts).
 * Hora de pared en el hueco sin registros entre la última fila de evidence en
 * UTC y la primera en hora de México. Aplica a toda columna escrita con
 * new Date() desde Node.
 */
export const SERVER_TZ_TO_MEXICO_CUT = '2026-02-25 00:00:00';

export const toPlantCountry = (countryName?: string | null): PlantCountry =>
  countryName === COLOMBIA_COUNTRY_NAME ? 'CO' : 'MX';

export interface StorageTimeZoneCut {
  /** Hora de pared guardada (exclusiva) hasta la que aplica el tramo; null = vigente. */
  until: string | null;
  zones: Record<PlantCountry, string>;
}

export type StorageTimeZoneRules<Column extends string> = Record<
  Column,
  StorageTimeZoneCut[]
>;

/** Falla si la columna no está en la tabla: nunca se asume una zona. */
export function assertStorageRuleColumn<Column extends string>(
  rules: StorageTimeZoneRules<Column>,
  rulesName: string,
  column: string,
): asserts column is Column {
  if (!Object.prototype.hasOwnProperty.call(rules, column)) {
    throw new Error(
      `No hay regla de zona de almacenamiento para la columna "${column}". ` +
        `Agrégala a ${rulesName} antes de exportarla.`,
    );
  }
}

/** Zona en la que está guardada `storedValue` (texto "YYYY-MM-DD HH:mm:ss[.f]"). */
export const resolveStorageTimeZone = <Column extends string>(
  rules: StorageTimeZoneRules<Column>,
  rulesName: string,
  column: string,
  country: PlantCountry,
  storedValue: string,
): string => {
  assertStorageRuleColumn(rules, rulesName, column);

  const wallText = storedValue.trim().slice(0, 19);
  const cut = rules[column].find(
    ({ until }) => until === null || wallText < until,
  );

  return cut.zones[country];
};

/** Convierte el texto guardado al instante real según la tabla de cortes. */
export const resolveStoredInstant = <Column extends string>(
  rules: StorageTimeZoneRules<Column>,
  rulesName: string,
  column: string,
  country: PlantCountry,
  storedValue: string,
): Date =>
  wallClockToInstant(
    parseWallClock(storedValue),
    resolveStorageTimeZone(rules, rulesName, column, country, storedValue),
  );
