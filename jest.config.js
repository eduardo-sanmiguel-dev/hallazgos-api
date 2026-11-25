// Configuración de Jest para los tests unitarios (src/**/*.spec.ts).
// Los e2e usan test/jest-e2e.json.
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const SRC = join(import.meta.dirname, 'src');

/**
 * Transformación con SWC: mucho más rápida que ts-jest, pero NO revisa tipos.
 * Los tipos de los tests se revisan con `pnpm typecheck`. La app es ESM, pero
 * los tests se transpilan a CommonJS para conservar jest.mock y require.
 */
const swcTransform = [
  '@swc/jest',
  {
    swcrc: false,
    sourceMaps: 'inline',
    module: { type: 'commonjs' },
    jsc: {
      target: 'es2021',
      keepClassNames: true,
      parser: { syntax: 'typescript', decorators: true },
      transform: { legacyDecorator: true, decoratorMetadata: true },
    },
  },
];

/**
 * `index.ts` que solo reexportan (`export ... from '...'`): no tienen lógica y
 * se excluyen del reporte. Los que sí la tienen (p. ej. shared/utils/index.ts)
 * se siguen midiendo. Se calcula al vuelo para no mantener una lista a mano.
 */
const isReexportOnly = (file) => {
  const code = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  return code
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
    .every((statement) =>
      /^export\s+(type\s+)?(\*(\s+as\s+\w+)?|\{[\s\S]*\})\s+from\s+['"][^'"]+['"]$/.test(
        statement,
      ),
    );
};

const findReexportOnlyIndexes = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return findReexportOnlyIndexes(path);
    return name === 'index.ts' && isReexportOnly(path)
      ? [`!${relative(SRC, path).split(sep).join('/')}`]
      : [];
  });

/**
 * Cobertura obligatoria: 100 % en todo el código medido (alcanzada el
 * 2026-11-18). Un archivo nuevo o un cambio sin tests rompe `pnpm test:cov`.
 * Lo que no tiene lógica propia se excluye en collectCoverageFrom.
 */
const FULL = { statements: 100, branches: 100, functions: 100, lines: 100 };

export default {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': swcTransform },
  testEnvironment: 'node',
  // Limita la memoria por proceso en suites largas; configuración validada
  // en Windows. --runInBand sigue disponible para depurar.
  maxWorkers: 2,
  workerIdleMemoryLimit: '256MB',
  // Los imports relativos llevan la extensión .js del código compilado.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  coverageDirectory: '../coverage',
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  collectCoverageFrom: [
    '**/*.ts',
    // Sin lógica propia o fuera del alcance de tests unitarios.
    '!**/*.spec.ts',
    '!**/*.module.ts',
    '!**/*.dto.ts',
    '!**/dto/**',
    '!**/*.entity.ts',
    '!**/entities/**',
    '!**/*.interface.ts',
    '!**/*.interfaces.ts',
    '!**/interfaces/**',
    '!**/*.enum.ts',
    '!main.ts',
    // Entry points exercised by scripts/test-mail-runtime.mjs; delivery logic has unit/DB tests.
    '!mail-worker.ts',
    '!mail-admin.ts',
    // Arranque de las trazas (se carga con --import antes que la app).
    '!instrumentation.ts',
    '!config/**',
    '!migrations/**',
    '!database/**',
    // Sin uso: solo se referencia en un bloque comentado de main.ts.
    '!cluster.service.ts',
    ...findReexportOnlyIndexes(SRC),
  ],
  coverageThreshold: {
    // Las consultas SQL de dashboard.service se verifican además con
    // PostgreSQL en test/db.
    global: FULL,
  },
};
