// Configuración de Jest para los tests unitarios (src/**/*.spec.ts).
// Los e2e usan test/jest-e2e.json.
const { readdirSync, readFileSync, statSync } = require('fs');
const { join, relative, sep } = require('path');

const SRC = join(__dirname, 'src');

// Las claves de coverageThreshold se resuelven como rutas absolutas.
const inSrc = (path) => join(SRC, path);

/**
 * Transformación con SWC: mucho más rápida que ts-jest, pero NO revisa tipos.
 * Los tipos de los tests se revisan con `pnpm typecheck`.
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
 * Umbral global por etapas (plan aprobado). Para subir de etapa se cambia
 * STAGE. Aplica a los archivos que NO tienen umbral propio: en Jest, los
 * archivos que caen en una clave por carpeta/archivo se miden aparte y se
 * restan del cálculo global (el resumen de texto sí incluye todo).
 */
const STAGES = {
  // Piso actual redondeado hacia abajo: la cobertura no puede bajar.
  inicial: { statements: 15, branches: 8, functions: 8, lines: 14 },
  // Al terminar la prioridad P1 de la Fase 3.
  p1: { statements: 35, branches: 25, functions: 30, lines: 35 },
  p2: { statements: 55, branches: 45, functions: 50, lines: 55 },
  p3: { statements: 70, branches: 60, functions: 65, lines: 70 },
  final: { statements: 80, branches: 70, functions: 75, lines: 80 },
};
const STAGE = 'inicial';

const META = 'meta';
/**
 * Carpetas sensibles con umbral propio, más alto que el global. Cada una
 * tiene su meta y el mínimo vigente; en cuanto una carpeta alcanza su meta,
 * su mínimo pasa a ser la meta (META), sin esperar al resto.
 */
const FOLDERS = {
  auth: {
    meta: { statements: 90, branches: 85, functions: 90, lines: 90 },
    minimo: META, // alcanzada en la Fase 3, bloque A
  },
  'shared/middlewares': {
    meta: { statements: 85, branches: 80, functions: 85, lines: 85 },
    minimo: META, // alcanzada en la Fase 3, bloque A
  },
  evidences: {
    meta: { statements: 80, branches: 70, functions: 80, lines: 80 },
    minimo: { statements: 3, branches: 0, functions: 1, lines: 2 },
  },
};

const critical = Object.fromEntries(
  Object.entries(FOLDERS).map(([folder, { meta, minimo }]) => [
    inSrc(folder),
    minimo === META ? meta : minimo,
  ]),
);

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': swcTransform },
  testEnvironment: 'node',
  modulePaths: ['<rootDir>'],
  moduleNameMapper: {
    '^@config$': '<rootDir>/config',
    '^@shared/(.*)$': '<rootDir>/shared/$1',
    '^@test/(.*)$': '<rootDir>/../test/$1',
  },
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
    '!config/**',
    '!migrations/**',
    '!database/**',
    // Seed de datos de ejemplo de hallazgos (no es lógica de la app).
    '!evidences/evidences-seed.service.ts',
    ...findReexportOnlyIndexes(SRC),
  ],
  coverageThreshold: {
    global: STAGES[STAGE],
    ...critical,
    // dashboard.service es casi todo SQL a mano: se cubrirá con tests de
    // integración contra una BD de pruebas en la Fase 4. Mientras tanto se
    // mide (aparece en el reporte) pero, al tener su propia clave sin
    // mínimos, queda fuera del umbral global para que las metas por etapa
    // sean alcanzables.
    [inSrc('dashboard/dashboard.service.ts')]: {},
  },
};
