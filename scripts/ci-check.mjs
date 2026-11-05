import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

// Commands shared by GitHub Actions and the local Linux container.
const stages = {
  typecheck: [['typecheck']],
  unit: [
    ['test:cov', '--config', './jest.config.js', '--ci', '--runInBand'],
    ['exec', 'node', 'scripts/coverage-goal.js'],
  ],
  http: [['test:e2e', '--ci', '--runInBand']],
  database: [['test:db', '--ci'], ['build'], ['test:mail:runtime']],
};
const selected = process.argv[2] ?? 'all';
if (selected !== 'all' && !Object.hasOwn(stages, selected)) {
  console.error(`Unknown CI stage: ${selected}`);
  process.exit(1);
}
mkdirSync('public/static/images/evidences', { recursive: true });
for (const [name, commands] of Object.entries(stages)) {
  if (selected !== 'all' && selected !== name) continue;
  console.log(`\n=== CI: ${name} ===`);
  for (const args of commands) {
    const result = spawnSync('pnpm', args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, CI: 'true', NODE_ENV: 'test' },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
