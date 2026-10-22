/**
 * Trazas de OpenTelemetry hacia OpenObserve (solo producción).
 *
 * Se carga antes que la app con `node --import ./dist/instrumentation.js`
 * (ver ecosystem.config.js): en ESM, http, express, graphql y pg solo se
 * instrumentan si el hook se registra antes de importarlos. Sin
 * NODE_ENV=production u OBSERVE_* no hace nada.
 */
import { existsSync } from 'node:fs';
import { register } from 'node:module';

// ConfigModule carga el .env después; aquí las variables hacen falta antes.
const envFile = `.env.${process.env.NODE_ENV}`;
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { NODE_ENV, OBSERVE_ENDPOINT, OBSERVE_AUTH_HEADER } = process.env;

if (NODE_ENV === 'production' && OBSERVE_ENDPOINT && OBSERVE_AUTH_HEADER) {
  // Solo los módulos instrumentados: si el hook envuelve todo, cambia el
  // orden de evaluación de los imports circulares entre entidades y Nest
  // falla al arrancar (CircularDependencyException en @InjectRepository).
  register('@opentelemetry/instrumentation/hook.mjs', import.meta.url, {
    data: {
      include: [
        'http',
        'https',
        'node:http',
        'node:https',
        'express',
        'pg',
        'graphql',
        /[\\/]node_modules[\\/]graphql[\\/]/,
      ],
    },
  });

  // Import dinámico: fuera de producción ni siquiera se cargan.
  const [
    { NodeSDK },
    { OTLPTraceExporter },
    { HttpInstrumentation },
    { ExpressInstrumentation },
    { GraphQLInstrumentation },
    { PgInstrumentation },
  ] = await Promise.all([
    import('@opentelemetry/sdk-node'),
    import('@opentelemetry/exporter-trace-otlp-http'),
    import('@opentelemetry/instrumentation-http'),
    import('@opentelemetry/instrumentation-express'),
    import('@opentelemetry/instrumentation-graphql'),
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
      new GraphQLInstrumentation({
        // Un span por resolver con lógica, no por cada campo de cada fila.
        mergeItems: true,
        ignoreTrivialResolveSpans: true,
      }),
      new PgInstrumentation({
        // Solo consultas dentro de una petición (no las de tareas cron), y
        // sin los valores de los parámetros: pueden traer datos personales.
        requireParentSpan: true,
        enhancedDatabaseReporting: false,
      }),
    ],
  }).start();
}
