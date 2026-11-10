type ReadyTarget = { send?: (message: 'ready') => unknown };

/**
 * Avisa a pm2 que esta instancia ya atiende peticiones (wait_ready en
 * ecosystem.config.js). En el deploy, pm2 recarga las instancias del cluster
 * de una en una y espera este aviso antes de apagar la siguiente: siempre hay
 * una respondiendo y nginx no devuelve 502. Sin pm2 (desarrollo, pruebas)
 * `process.send` no existe y no hace nada.
 */
export function notifyProcessReady(target: ReadyTarget = process): void {
  target.send?.('ready');
}
