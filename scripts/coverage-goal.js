/**
 * Meta global del plan de pruebas: 80 % de sentencias y 70 % de ramas sobre
 * TODO el código medido, excepto dashboard.service.ts (lo cubren los tests de
 * integración contra la base de pruebas).
 *
 * El umbral "global" de Jest no sirve para esto: Jest le quita los archivos
 * que ya tienen umbral por carpeta (ver jest.config.js). Este script lee
 * coverage/coverage-summary.json (lo genera `pnpm test:cov`) y falla si la
 * meta no se cumple.
 */
const { join } = require('path');

const GOAL = { statements: 80, branches: 70 };
const EXCLUDED = /dashboard[\\/]dashboard\.service\.ts$/;

const summary = require(join(__dirname, '..', 'coverage', 'coverage-summary.json'));

const totals = { statements: { c: 0, t: 0 }, branches: { c: 0, t: 0 } };

for (const [file, metrics] of Object.entries(summary)) {
  if (file === 'total' || EXCLUDED.test(file)) continue;

  for (const key of Object.keys(totals)) {
    totals[key].c += metrics[key].covered;
    totals[key].t += metrics[key].total;
  }
}

let failed = false;

for (const [key, { c, t }] of Object.entries(totals)) {
  const pct = t ? (100 * c) / t : 100;
  const ok = pct >= GOAL[key];
  failed ||= !ok;
  console.log(
    `${ok ? 'OK ' : 'NO '} ${key.padEnd(10)} ${pct.toFixed(2)} % (meta ${GOAL[key]} %)`,
  );
}

process.exit(failed ? 1 : 0);
