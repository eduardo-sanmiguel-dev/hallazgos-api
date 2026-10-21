/**
 * Metas sobre TODO el código del reporte unitario, incluido dashboard.service.
 * Los umbrales de carpetas de Jest se conservan como controles adicionales.
 * Uso: node scripts/coverage-goal.js [ruta a coverage-summary.json]
 */
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const GOAL = { statements: 85, branches: 80, functions: 85, lines: 85 };
const report = process.argv[2]
  ? resolve(process.argv[2])
  : join(import.meta.dirname, '..', 'coverage', 'coverage-summary.json');

try {
  const summary = JSON.parse(readFileSync(report, 'utf8'));
  let failed = false;
  for (const [key, minimum] of Object.entries(GOAL)) {
    const metric = summary.total?.[key];
    if (
      !metric ||
      !Number.isFinite(metric.covered) ||
      !Number.isFinite(metric.total) ||
      metric.total < 0 ||
      metric.covered < 0 ||
      metric.covered > metric.total
    ) {
      throw new Error('Métrica ausente o inválida: ' + key);
    }
    const percentage = metric.total
      ? (100 * metric.covered) / metric.total
      : 100;
    const passed = percentage >= minimum;
    failed ||= !passed;
    console.log(
      (passed ? 'OK ' : 'NO ') +
        key.padEnd(10) +
        ' ' +
        (Math.floor(percentage * 100) / 100).toFixed(2) +
        ' % (meta ' +
        minimum +
        ' %)',
    );
  }
  process.exitCode = failed ? 1 : 0;
} catch (error) {
  console.error('No se pudo verificar la cobertura: ' + error.message);
  process.exitCode = 1;
}
