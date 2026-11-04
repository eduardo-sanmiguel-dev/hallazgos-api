import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const result = spawnSync(
  process.execPath,
  ['node_modules/@nestjs/cli/bin/nest.js', 'build', ...process.argv.slice(2)],
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

// Solo un build terminado recibe un ID nuevo. Se conserva al reiniciar PM2.
// El proceso activo lee su ID una vez al arrancar, nunca el del siguiente build.
const version = randomUUID();
const file = join('dist', 'deployment-version.json');
const temporary = `${file}.${process.pid}.tmp`;
await writeFile(temporary, JSON.stringify({ version }), 'utf8');
await rename(temporary, file);
console.log(`Versión de API: ${version}`);
