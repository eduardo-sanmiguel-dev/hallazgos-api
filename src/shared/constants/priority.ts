// Prioridad de atención de un hallazgo. Se guarda solo el número de días
// (`evidence.priorityDays`); el vencimiento se calcula con createdAt + días.
// Único mapeo del API: dashboard (prioridad y nivel de riesgo), correos y
// carga inicial. La UI tiene el mismo en
// hallazgos-ui/app/(routes)/hallazgos/_constants/priorityOptions.ts.
//
// Hasta el 26-jun-2026 la UI guardaba "Inmediato" = 8 y "Corto plazo" = 2, y
// el dashboard siguió así hasta esta corrección. Los días guardados no se
// cambiaron (ver docs/ux-auditoria.md de la UI, sección 5).

export type RiskLevel = 'Bajo' | 'Medio' | 'Alto' | 'Critico';

export interface PriorityLevel {
  name: string;
  days: number;
  riskLevel: RiskLevel;
  // Color de la gráfica de prioridad del dashboard.
  color: string;
}

// Del plazo más corto (más urgente) al más largo.
export const PRIORITY_LEVELS: readonly PriorityLevel[] = [
  { name: 'Inmediato', days: 2, riskLevel: 'Critico', color: '#D32F2F' },
  { name: 'Corto plazo', days: 8, riskLevel: 'Alto', color: '#F9A825' },
  { name: 'Mediano plazo', days: 15, riskLevel: 'Medio', color: '#1565C0' },
  { name: 'Largo plazo', days: 30, riskLevel: 'Bajo', color: '#2E7D32' },
];

// Del más bajo al más alto, como lo muestra la gráfica de nivel de riesgo.
export const RISK_LEVELS: readonly { name: RiskLevel; color: string }[] = [
  { name: 'Bajo', color: '#7CB342' },
  { name: 'Medio', color: '#FFEB3B' },
  { name: 'Alto', color: '#FF9800' },
  { name: 'Critico', color: '#F44336' },
];

export const priorityLevelByDays = (days?: number | null) =>
  PRIORITY_LEVELS.find((level) => level.days === days);

// Etiqueta para los correos: "Inmediato (2 dias)"; días fuera del catálogo
// solo con el número; sin prioridad, vacío.
export const priorityLabel = (days?: number | null) => {
  if (!days) return '';
  const level = priorityLevelByDays(days);
  return level ? `${level.name} (${level.days} dias)` : `${days} dias`;
};

// Días por nombre (sin acentos ni mayúsculas), para la carga desde Excel.
export const PRIORITY_DAYS_BY_NAME: Readonly<Record<string, number>> =
  Object.fromEntries(
    PRIORITY_LEVELS.map((level) => [level.name.toLowerCase(), level.days]),
  );

// Nivel de riesgo en SQL. Un plazo es del nivel del primer escalón que no
// supera (2 → Critico, 8 → Alto, 15 → Medio, más → Bajo); sin prioridad,
// NULL.
export const riskLevelSqlCase = (column: string) => `
  CASE
    WHEN COALESCE(${column}, 0) <= 0 THEN NULL
    ${PRIORITY_LEVELS.slice(0, -1)
      .map(
        (level) => `WHEN ${column} <= ${level.days} THEN '${level.riskLevel}'`,
      )
      .join('\n    ')}
    ELSE '${PRIORITY_LEVELS[PRIORITY_LEVELS.length - 1].riskLevel}'
  END
`;
