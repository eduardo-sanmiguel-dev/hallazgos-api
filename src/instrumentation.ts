/**
 * Trazas de OpenTelemetry hacia OpenObserve (solo producción).
 *
 * Se carga antes que la app con `node --import ./dist/instrumentation.js`
 * (ver ecosystem.config.js): en ESM, http, express y pg solo se
 * instrumentan si el hook se registra antes de importarlos. Sin
 * NODE_ENV=production u OBSERVE_* no hace nada.
 */
import { existsSync } from 'node:fs';
// Hook síncrono (module.registerHooks): module.register() está obsoleto desde
// Node 26 (DEP0205). Debe ser el mismo import-in-the-middle que usa
// @opentelemetry/instrumentation para que vea sus Hook().
import { register } from 'import-in-the-middle/register-hooks.mjs';
import {
  instrumentationEnvFile,
  instrumentationNodeEnv,
} from './instrumentation-env.js';

// ConfigModule carga el .env después; aquí las variables hacen falta antes.
// En cluster pm2 aún no aplicó el entorno de la app (directorio "/" y sin
// NODE_ENV): por eso la ruta es relativa a este archivo y NODE_ENV se lee
// también de pm2_env.
const NODE_ENV = instrumentationNodeEnv();
const envFile = instrumentationEnvFile(NODE_ENV);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { OBSERVE_ENDPOINT, OBSERVE_AUTH_HEADER } = process.env;

if (NODE_ENV === 'production' && OBSERVE_ENDPOINT && OBSERVE_AUTH_HEADER) {
  // Solo los módulos instrumentados: si el hook envuelve todo, cambia el
  // orden de evaluación de los imports circulares entre entidades y Nest
  // falla al arrancar (CircularDependencyException en @InjectRepository).
  register({
    include: ['http', 'https', 'node:http', 'node:https', 'express', 'pg'],
  });

  // Import dinámico: fuera de producción ni siquiera se cargan.
  const [
    { NodeSDK },
    { OTLPTraceExporter },
    { HttpInstrumentation },
    { ExpressInstrumentation },
    { PgInstrumentation },
  ] = await Promise.all([
    import('@opentelemetry/sdk-node'),
    import('@opentelemetry/exporter-trace-otlp-http'),
    import('@opentelemetry/instrumentation-http'),
    import('@opentelemetry/instrumentation-express'),
    import('@opentelemetry/instrumentation-pg'),
  ]);

  new NodeSDK({
    serviceName: 'api-comportarte',
    traceExporter: new OTLPTraceExporter({
      url: `${OBSERVE_ENDPOINT.replace(/\/+$/, '')}/v1/traces`,
      headers: { Authorization: OBSERVE_AUTH_HEADER },
    }),
    instrumentations: [
      new HttpInstrumentation({
        // El monitoreo consulta el health check a cada rato.
        ignoreIncomingRequestHook: (request) =>
          !!request.url?.startsWith('/api/v1/health'),
      }),
      new ExpressInstrumentation(),
      new PgInstrumentation({
        // Solo consultas dentro de una petición (no las de tareas cron), y
        // sin los valores de los parámetros: pueden traer datos personales.
        requireParentSpan: true,
        enhancedDatabaseReporting: false,
      }),
    ],
  }).start();
}
