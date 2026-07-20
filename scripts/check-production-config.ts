import { readFileSync } from 'node:fs';
import { runtimeConfigChecks } from '../src/lib/env';

const fileValues: Record<string, string> = {};
try {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !match[1].startsWith('#')) fileValues[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
} catch { /* process environment is the deployment source of truth */ }

const result = runtimeConfigChecks({ ...fileValues, ...process.env, NODE_ENV: 'production' });

console.log(`Production configuration: ${result.ready ? 'ready' : 'not ready'}`);
for (const check of result.checks) console.log(`${check.ok ? 'OK' : 'MISSING'}  ${check.name}`);
for (const warning of result.warnings) console.warn(`WARNING  ${warning}`);

if (!result.ready) {
  console.error('Set the required production environment variables before deployment. Values are never printed by this check.');
  process.exitCode = 1;
}
