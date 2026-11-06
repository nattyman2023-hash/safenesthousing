/**
 * Clean production-build regression check.
 *
 * The React 18 / Next 16 mismatch only failed on a cold `.next` cache: a warm build could hide the
 * `useContext` of null crash in `/_global-error` and `/_not-found`. This script always deletes the
 * cache first, then runs the real production build and fails loudly on any non-zero exit.
 *
 * Run with: npm run verify:build
 */
import { rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

await rm('.next', { recursive: true, force: true });

const result = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' }
});

if (result.error) {
  console.error('Clean production build could not start:', result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`Clean production build failed with exit code ${result.status ?? 'unknown'}.`);
  process.exit(result.status ?? 1);
}

console.log('Clean production build passed from an empty .next cache.');
