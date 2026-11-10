import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { notifyProcessReady } from './process-ready.js';
import { apps } from '../../../ecosystem.config.js';

describe('notifyProcessReady', () => {
  it('avisa "ready" a pm2 cuando corre bajo pm2', () => {
    const send = jest.fn();

    notifyProcessReady({ send });

    expect(send).toHaveBeenCalledWith('ready');
  });

  it('sin pm2 (desarrollo, pruebas) no hace nada', () => {
    expect(() => notifyProcessReady({})).not.toThrow();
  });
});

describe('ecosystem.config.js: deploy sin caída de la API', () => {
  const app = (name: string) => apps.find((entry) => entry.name === name);

  it('la API corre en cluster con al menos 2 instancias que esperan el aviso "ready"', () => {
    const api = app('api-comp');

    expect(api).toMatchObject({ exec_mode: 'cluster', wait_ready: true });
    expect(api.instances).toBeGreaterThanOrEqual(2);
    // Si una instancia nueva no avisa a tiempo, el reload falla sin apagar la otra.
    expect(api.listen_timeout).toBeGreaterThan(0);
  });

  it.each(['api-comp', 'mail-worker'])(
    '%s carga las trazas con ruta absoluta y fija su directorio (en cluster pm2 arranca desde "/")',
    (name) => {
      const { node_args, cwd } = app(name);

      expect(node_args).toMatch(
        /^--import file:\/\/\/.+\/dist\/instrumentation\.js$/,
      );
      expect(cwd).toMatch(/[\\/]$/);
      expect(existsSync(join(cwd, 'ecosystem.config.js'))).toBe(true);
    },
  );

  it('el worker de correos sigue siendo un solo proceso (no duplica envíos)', () => {
    expect(app('mail-worker')).toMatchObject({
      exec_mode: 'fork',
      instances: 1,
    });
  });
});
