import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { instrumentationEnvFile } from './instrumentation-env.js';

describe('instrumentationEnvFile', () => {
  const root = join(tmpdir(), 'app');
  const moduleUrl = pathToFileURL(
    join(root, 'dist', 'instrumentation.js'),
  ).href;

  it('apunta al .env de la raíz del proyecto (un nivel arriba de dist/)', () => {
    expect(instrumentationEnvFile('production', moduleUrl)).toBe(
      join(root, '.env.production'),
    );
  });

  it('no depende del directorio de trabajo (en cluster pm2 arranca desde "/")', () => {
    const project = mkdtempSync(join(tmpdir(), 'instrumentation-env-'));
    try {
      mkdirSync(join(project, 'dist'));
      writeFileSync(join(project, '.env.production'), 'OBSERVE_ENDPOINT=x\n');
      // Mismo cálculo, ejecutado como lo hace pm2: --import con cwd en la raíz del disco.
      writeFileSync(
        join(project, 'dist', 'probe.mjs'),
        `import { existsSync } from 'node:fs';
         import { fileURLToPath } from 'node:url';
         const envFile = fileURLToPath(new URL('../.env.production', import.meta.url));
         process.stdout.write(String(existsSync(envFile)));`,
      );
      const found = execFileSync(
        process.execPath,
        [join(project, 'dist', 'probe.mjs')],
        { cwd: join(project, '/').split(/[\\/]/)[0] + '/', encoding: 'utf8' },
      );

      expect(found).toBe('true');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});
