import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const sha = process.argv[2];
const project = `hallazgos-ci-${randomUUID()}`;
let temporary;
let compose;
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} terminó con código ${result.status ?? 1}`);
}
try {
  try {
    run('docker', ['info'], { stdio: 'ignore' });
    run('docker', ['compose', 'version'], { stdio: 'ignore' });
  } catch {
    throw new Error(
      'Inicia Docker Desktop (contenedores Linux) con Docker Compose para validar el push.',
    );
  }
  let context = root;
  if (sha) {
    if (!/^[a-f0-9]{40,64}$/.test(sha)) throw new Error('Commit inválido');
    temporary = mkdtempSync(join(tmpdir(), 'hallazgos-ci-'));
    const archive = join(temporary, 'source.tar');
    run('git', ['archive', '--format=tar', `--output=${archive}`, sha]);
    run('tar', ['-xf', archive, '-C', temporary]);
    rmSync(archive);
    context = temporary;
  }
  const { packageManager } = JSON.parse(
    readFileSync(join(context, 'package.json'), 'utf8'),
  );
  const version = /^pnpm@(\d+\.\d+\.\d+)$/.exec(packageManager)?.[1];
  if (!version)
    throw new Error('packageManager debe fijar una versión exacta de pnpm');
  compose = [
    'compose',
    '--project-name',
    project,
    '--file',
    join(context, 'compose.ci.yaml'),
  ];
  run('docker', [
    ...compose,
    'build',
    '--build-arg',
    `PNPM_VERSION=${version}`,
    'checks',
  ]);
  run('docker', [...compose, 'run', '--rm', 'checks']);
  console.log('CI local completada correctamente.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (compose) {
    const cleanup = spawnSync(
      'docker',
      [...compose, 'down', '--volumes', '--remove-orphans', '--rmi', 'local'],
      {
        cwd: root,
        stdio: 'inherit',
      },
    );
    if (cleanup.error || cleanup.status !== 0) {
      console.error(`No se pudo limpiar el proyecto temporal ${project}.`);
      process.exitCode = 1;
    }
  }
  if (temporary) rmSync(temporary, { recursive: true, force: true });
}
