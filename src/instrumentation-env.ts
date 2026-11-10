import { fileURLToPath } from 'node:url';

/**
 * `.env.<NODE_ENV>` que lee la instrumentación de trazas, relativo a este
 * archivo (dist/ → raíz del proyecto) y no al directorio de trabajo: en modo
 * cluster pm2 ejecuta el `--import` antes de cambiar al cwd de la app (arranca
 * en "/"). Con la ruta relativa no encontraba el archivo, faltaban
 * OBSERVE_ENDPOINT/OBSERVE_AUTH_HEADER y las trazas se apagaban sin avisar.
 */
export function instrumentationEnvFile(
  nodeEnv: string | undefined,
  moduleUrl: string = import.meta.url,
): string {
  return fileURLToPath(new URL(`../.env.${nodeEnv}`, moduleUrl));
}
