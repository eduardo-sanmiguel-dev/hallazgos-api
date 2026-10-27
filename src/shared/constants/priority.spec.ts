import {
  PRIORITY_DAYS_BY_NAME,
  PRIORITY_LEVELS,
  priorityLabel,
  priorityLevelByDays,
  riskLevelSqlCase,
} from './priority.js';

describe('Mapeo de prioridad', () => {
  it('Inmediato es el plazo más corto y el riesgo más alto', () => {
    expect(
      PRIORITY_LEVELS.map(({ name, days, riskLevel }) => [
        name,
        days,
        riskLevel,
      ]),
    ).toEqual([
      ['Inmediato', 2, 'Critico'],
      ['Corto plazo', 8, 'Alto'],
      ['Mediano plazo', 15, 'Medio'],
      ['Largo plazo', 30, 'Bajo'],
    ]);
    const days = PRIORITY_LEVELS.map((level) => level.days);
    expect(days).toEqual([...days].sort((a, b) => a - b));
  });

  it('etiqueta de los correos', () => {
    expect(priorityLabel(2)).toBe('Inmediato (2 dias)');
    expect(priorityLabel(8)).toBe('Corto plazo (8 dias)');
    expect(priorityLabel(5)).toBe('5 dias');
    expect(priorityLabel(null)).toBe('');
    expect(priorityLabel(0)).toBe('');
    expect(priorityLevelByDays(30)?.name).toBe('Largo plazo');
  });

  it('días por nombre para la carga desde Excel', () => {
    expect(PRIORITY_DAYS_BY_NAME).toEqual({
      inmediato: 2,
      'corto plazo': 8,
      'mediano plazo': 15,
      'largo plazo': 30,
    });
  });

  it('el CASE de riesgo sube por escalones y deja NULL sin prioridad', () => {
    const sql = riskLevelSqlCase('e."priorityDays"').replace(/\s+/g, ' ');
    expect(sql).toContain(`WHEN COALESCE(e."priorityDays", 0) <= 0 THEN NULL`);
    expect(sql).toContain(
      `WHEN e."priorityDays" <= 2 THEN 'Critico' ` +
        `WHEN e."priorityDays" <= 8 THEN 'Alto' ` +
        `WHEN e."priorityDays" <= 15 THEN 'Medio' ` +
        `ELSE 'Bajo' END`,
    );
  });
});
