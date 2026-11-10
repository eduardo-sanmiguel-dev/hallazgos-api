import { fileURLToPath } from 'node:url';

/**
 * NODE_ENV de la app al cargar la instrumentación. En modo cluster pm2 arranca
 * cada worker sin las variables de la app: las manda serializadas en
 * `pm2_env` y las copia a process.env después del `--import`. Sin esto, en
 * cluster NODE_ENV llegaba vacío y las trazas no se activaban.
 */
export function instrumentationNodeEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (env.NODE_ENV) return env.NODE_ENV;
  try {
    const pm2 = JSON.parse(env.pm2_env ?? '') as {
      NODE_ENV?: string;
      env?: { NODE_ENV?: string };
    };
    return pm2.env?.NODE_ENV ?? pm2.NODE_ENV;
  } catch {
    return undefined;
  }
}

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
