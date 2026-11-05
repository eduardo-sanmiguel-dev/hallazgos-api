import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Git supplies the actual objects being pushed. Test those committed trees,
// so uncommitted fixes cannot hide a broken commit (including non-HEAD pushes).
const commits = new Set();
for (const line of readFileSync(0, 'utf8').trim().split(/\r?\n/)) {
  if (!line) continue;
  const [, sha] = line.split(/\s+/);
  if (!/^[a-f0-9]{40,64}$/.test(sha)) {
    console.error('No se pudo identificar el commit del push.');
    process.exit(1);
  }
  if (!/^0+$/.test(sha)) commits.add(sha); // Ref deletion needs no build.
}
for (const sha of commits) {
  console.log(`Validando el commit que se enviará: ${sha}`);
  const result = spawnSync(process.execPath, ['scripts/ci-local.mjs', sha], {
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(
      'Push bloqueado: las validaciones de CI no terminaron correctamente.',
    );
    process.exit(result.status ?? 1);
  }
}
