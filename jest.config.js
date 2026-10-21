// Configuración de Jest para los tests unitarios (src/**/*.spec.ts).
// Los e2e usan test/jest-e2e.json.
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const SRC = join(import.meta.dirname, 'src');

// Las claves de coverageThreshold se resuelven como rutas absolutas.
const inSrc = (path) => join(SRC, path);

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
 * Umbral global por etapas (plan aprobado). Para subir de etapa se cambia
 * STAGE. Aplica a los archivos que NO tienen umbral propio: en Jest, los
 * archivos que caen en una clave por carpeta/archivo se miden aparte y se
 * restan del cálculo global (el resumen de texto sí incluye todo).
 */
const STAGES = {
  // Piso actual redondeado hacia abajo: la cobertura no puede bajar.
  inicial: { statements: 20, branches: 14, functions: 11, lines: 18 },
  // Al terminar la prioridad P1 de la Fase 3.
  p1: { statements: 35, branches: 25, functions: 30, lines: 35 },
  p2: { statements: 55, branches: 45, functions: 50, lines: 55 },
  p3: { statements: 70, branches: 60, functions: 65, lines: 70 },
  final: { statements: 80, branches: 70, functions: 75, lines: 80 },
};
const STAGE = 'final'; // alcanzada al terminar la P3 (2026-10-20)

// Piso real de los archivos sin umbral de carpeta (ver coverageThreshold).
const RESTO = { statements: 79, branches: 70, functions: 56, lines: 76 };

const META = 'meta';

/**
 * Meta de los módulos con lógica de negocio (plan: 85 % de sentencias). Las
 * funciones quedan en 70: algunos módulos conservan stubs generados por Nest
 * (update/remove que solo devuelven un texto) que no se prueban a propósito.
 */
const SERVICE_META = { statements: 85, branches: 70, functions: 70, lines: 85 };

const BUSINESS_FOLDERS = [
  'users',
  'epps',
  'ciaels',
  'employees',
  'equipments',
  'gemba-walks',
  'gemba-walk-calendar',
  'gemba-walk-evaluations',
  'gemba-walk-observers',
  'gemba-walk-zones',
  'mail',
  'extinguisher-inspections',
  'manufacturing-plants',
  'areas',
  'zones',
  'processes',
  'main-types',
  'secondary-types',
  'ics',
  'emergency-teams',
  'shared/utils',
  'shared/pipes',
  'shared/services',
  'shared/filters',
  'shared/interceptors',
];
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
    minimo: META, // alcanzada en la Fase 3, flujos C3 y C5
  },
};

for (const folder of BUSINESS_FOLDERS) {
  FOLDERS[folder] = { meta: SERVICE_META, minimo: META }; // alcanzada en P1–P3
}

const critical = Object.fromEntries(
  Object.entries(FOLDERS).map(([folder, { meta, minimo }]) => [
    inSrc(folder),
    minimo === META ? meta : minimo,
  ]),
);

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
    // Clases de argumentos y tipos de GraphQL: son el equivalente de los DTOs
    // (solo decoradores; sus funciones de tipo se ejecutan al armar el schema).
    '!**/inputs/**',
    '!**/types/**',
    '!main.ts',
    '!config/**',
    '!migrations/**',
    '!database/**',
    // Seed de datos de ejemplo de hallazgos (no es lógica de la app).
    '!evidences/evidences-seed.service.ts',
    // Sin uso: solo se referencia en un bloque comentado de main.ts.
    '!cluster.service.ts',
    ...findReexportOnlyIndexes(SRC),
  ],
  coverageThreshold: {
    // Con umbral propio en cada carpeta de negocio, el "global" de Jest solo
    // mide el resto: sobre todo catálogos con stubs generados por Nest
    // (findOne/update/remove que devuelven un texto y no se prueban). Por eso
    // aquí va el piso real de ese resto; la meta global (85/80/85/85 sobre
    // todo el código medido) la verifica `pnpm test:cov:goal`.
    global: RESTO,
    ...critical,
    // Sus consultas SQL se verifican además con PostgreSQL en test/db.
    // La meta total 85/80/85/85 incluye este archivo y se valida en CI.
    [inSrc('dashboard/dashboard.service.ts')]: {},
  },
};
