type SignalTarget = {
  on(signal: NodeJS.Signals, listener: () => void): unknown;
  exit(code?: number): unknown;
};

/**
 * Cierra ordenadamente y SIEMPRE termina el proceso ante SIGTERM/SIGINT.
 *
 * Al registrar un listener, Node deja de salir solo con la señal; si algo deja
 * handles abiertos, pm2 espera kill_timeout y hace SIGKILL. Durante un apagado
 * del servidor eso supera el TimeoutStopSec de systemd, que mata a pm2 y le
 * hace sobrescribir dump.pm2 sin las apps ya detenidas (no vuelven al arrancar).
 * `timeoutMs` debe quedar por debajo del kill_timeout de ecosystem.config.js.
 */
export function exitOnSignal(
  close: () => Promise<unknown>,
  { timeoutMs = 90_000, target = process as SignalTarget } = {},
) {
  let closing = false;
  const handler = () => {
    if (closing) return;
    closing = true;
    const guard = setTimeout(() => target.exit(1), timeoutMs);
    close()
      .then(
        () => target.exit(0),
        () => target.exit(1),
      )
      .finally(() => clearTimeout(guard));
  };
  for (const signal of ['SIGTERM', 'SIGINT'] as const)
    target.on(signal, handler);
}
