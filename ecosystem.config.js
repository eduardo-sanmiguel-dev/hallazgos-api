// pm2 carga este archivo con require(): en Node 22+ eso funciona con ESM y
// devuelve los exports nombrados, por eso `apps` se exporta por nombre.
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('.', import.meta.url));
// Trazas: se cargan antes que la app. Ruta absoluta: en modo cluster pm2
// arranca los procesos desde "/" y "./dist/..." no se encuentra
// (ERR_MODULE_NOT_FOUND); probado en el VPS con pm2 7.1 y Node 26.
const instrumentation = `--import ${new URL('./dist/instrumentation.js', import.meta.url).href}`;

export const apps = [
  {
    name: 'api-comp', // Nombre en pm2 (corto: los logs lo recortan a 10 caracteres)
    namespace: 'comportarte', // Grupo en pm2: pm2 logs/restart comportarte
    script: 'dist/main.js', // Archivo compilado de NestJS
    cwd,
    node_args: instrumentation,
    // Deploy sin caída: 2 instancias en cluster que pm2 recarga de una en una;
    // espera el aviso "ready" de la nueva (main.ts, notifyProcessReady) antes
    // de apagar la siguiente, así siempre hay una respondiendo.
    instances: 2,
    exec_mode: 'cluster',
    wait_ready: true,
    listen_timeout: 30000, // Sin aviso en 30 s: el reload falla sin apagar la otra
    kill_timeout: 10000, // Tiempo para terminar las peticiones en curso al apagar
    watch: false, // Desactiva watch en producción
    max_memory_restart: '5G', // Reinicia si excede 5GB de RAM
    env: {
      NODE_ENV: 'production', // Variables de entorno para producción
      PORT: 4000,
      TZ: 'America/Mexico_City', // Zona del proceso: las columnas "timestamp without time zone" se guardan en esta hora de pared
    },
    out_file: './logs/out.log', // Log de salida estándar
    error_file: './logs/error.log', // Log de errores
    merge_logs: true, // Combina logs de instancias
    log_date_format: 'DD/MM/YYYY HH:mm', // Fecha en cada línea del log (con time: true pm2 lo ignora)
  },
  {
    name: 'mail-worker',
    namespace: 'comportarte',
    script: 'dist/mail-worker.js',
    cwd,
    node_args: instrumentation,
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '512M',
    kill_timeout: 120000,
    exp_backoff_restart_delay: 1000,
    env: { NODE_ENV: 'production', TZ: 'America/Mexico_City' },
    out_file: './logs/mail-out.log',
    error_file: './logs/mail-error.log',
    merge_logs: true,
    log_date_format: 'DD/MM/YYYY HH:mm',
  },
];

export default { apps };
