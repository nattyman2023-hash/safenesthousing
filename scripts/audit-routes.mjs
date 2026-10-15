#!/usr/bin/env node
/**
 * Route and navigation auditor.
 *
 * Builds the authoritative route inventory from src/app, then extracts every internal
 * navigation target the application can produce (Link href, form action, router.push/replace,
 * redirect(), fetch()) and resolves each one against that inventory. Anything that does not
 * resolve is reported, and the script exits non-zero, so a broken link fails a deployment gate
 * instead of only showing up as a 404 in production.
 *
 * Three failure classes are distinguished, because they have different fixes:
 *   MISSING       - the target has no page or route handler anywhere (fix the link or add the route)
 *   CASE MISMATCH - the target resolves only when case is ignored; Linux will 404, Windows will not
 *   DYNAMIC OK    - the target matches a [param] route, so the record itself decides 404 or 200
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const APP_DIR = join(process.cwd(), 'src', 'app');
const SRC_DIR = join(process.cwd(), 'src');

async function walk(directory, predicate) {
  const found = [];
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await walk(full, predicate));
    else if (predicate(entry.name)) found.push(full);
  }
  return found;
}

const toPosix = (value) => value.split(sep).join('/');

/** route groups such as (public) organise files without appearing in the URL. */
function toRoute(file, appDir) {
  const relativePath = toPosix(relative(appDir, file));
  const withoutFile = relativePath.replace(/\/(page|route)\.tsx?$/, '');
  const segments = withoutFile.split('/').filter((segment) => segment && !/^\(.*\)$/.test(segment));
  return segments.length ? `/${segments.join('/')}` : '/';
}

const pageFiles = await walk(APP_DIR, (name) => name === 'page.tsx');
const apiFiles = await walk(APP_DIR, (name) => name === 'route.ts');

const pages = new Map(pageFiles.map((file) => [toRoute(file, APP_DIR), file]));
const apis = new Map(apiFiles.map((file) => [toRoute(file, APP_DIR), file]));
const known = new Map([...pages, ...apis]);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A [param] segment matches one URL segment; [...catch] matches the rest. */
function patternFor(route) {
  const source = route.split('/').map((segment) => {
    if (/^\[\.\.\..+\]$/.test(segment)) return '.*';
    if (/^\[.+\]$/.test(segment)) return '[^/]+';
    return escapeRegex(segment);
  }).join('/');
  return new RegExp(`^${source}/?$`);
}

const dynamicRoutes = [...known.keys()].filter((route) => route.includes('['));
const dynamicPatterns = dynamicRoutes.map((route) => ({ route, pattern: patternFor(route) }));
const lowercaseRoutes = new Map([...known.keys()].map((route) => [route.toLowerCase(), route]));

const SOURCE_FILES = await walk(SRC_DIR, (name) => /\.tsx?$/.test(name));

/** Every expression shape the codebase uses to point at an internal URL. */
const REFERENCE_PATTERNS = [
  { kind: 'link', pattern: /href\s*[:=]\s*["'](\/[^"']*)["']/g },
  { kind: 'link', pattern: /href\s*=\s*\{\s*[`'"](\/[^`'"]*)[`'"]\s*\}/g },
  { kind: 'action', pattern: /(?:formAction|action)\s*[:=]\s*["'](\/[^"']*)["']/g },
  { kind: 'redirect', pattern: /(?:^|[^.\w])redirect\(\s*[`'"]([^`'"]*)/g },
  { kind: 'router', pattern: /router\.(?:push|replace)\(\s*[`'"]([^`'"]*)/g },
  { kind: 'fetch', pattern: /fetch\(\s*[`'"]([^`'"]*)/g },
  { kind: 'url', pattern: /url:\s*[`'"]([^`'"]*)/g }
];

const references = [];
for (const file of SOURCE_FILES) {
  const text = await readFile(file, 'utf8');
  // Words that look like URL segments and appear as string literals in this file. A template such
  // as `/api/crm/incidents/${id}/${path}` is only valid if one of the literals passed at the call
  // sites (`post('actions')`, `post('updates')`) resolves to a real route.
  const candidates = [...new Set([...text.matchAll(/['"`]([a-z][a-z0-9_-]{1,30})['"`]/g)].map((match) => match[1]))];
  for (const { kind, pattern } of REFERENCE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const raw = match[1];
      if (!raw.startsWith('/') || raw.startsWith('//')) continue;
      const line = text.slice(0, match.index).split('\n').length;
      references.push({ kind, raw, candidates, target: raw.split('#')[0].split('?')[0] || '/', file: toPosix(relative(process.cwd(), file)), line });
    }
  }
}

/** Every combination of up to four candidate literals, bounded so a large file cannot explode. */
function combinations(values, count) {
  let results = [[]];
  for (let index = 0; index < count && results.length && results.length <= 64; index += 1) {
    results = results.flatMap((prefix) => values.map((value) => [...prefix, value])).slice(0, 64);
  }
  return results;
}

function classify(reference) {
  const { target, candidates } = reference;
  if (known.has(target)) return { verdict: 'OK', route: target };
  const variables = [...target.matchAll(/\$\{[^}]*\}/g)].length;
  // One wildcard segment per variable: proves a [param] route exists at this exact shape.
  const wildcard = target.replace(/\$\{[^}]*\}/g, 'sample-id');
  for (const { route, pattern } of dynamicPatterns) if (pattern.test(wildcard)) return { verdict: 'DYNAMIC', route, resolvedAs: null };
  if (variables) {
    for (const combination of combinations(candidates, variables)) {
      let index = 0;
      const filled = target.replace(/\$\{[^}]*\}/g, () => combination[index++]);
      if (known.has(filled)) return { verdict: 'DYNAMIC', route: filled, resolvedAs: filled };
      for (const { route, pattern } of dynamicPatterns) if (pattern.test(filled)) return { verdict: 'DYNAMIC', route, resolvedAs: filled };
    }
  }
  const ciMatch = lowercaseRoutes.get(target.toLowerCase());
  if (ciMatch) return { verdict: 'CASE MISMATCH', route: ciMatch };
  return { verdict: 'MISSING', route: null };
}

const resolved = references.map((reference) => ({ ...reference, ...classify(reference) }));
const problems = resolved.filter((entry) => entry.verdict === 'MISSING' || entry.verdict === 'CASE MISMATCH');

const referencedRoutes = new Set(resolved.filter((entry) => entry.verdict === 'OK' || entry.verdict === 'DYNAMIC').map((entry) => entry.route));
const unreferencedPages = [...pages.keys()]
  .filter((route) => !route.includes('[') && route !== '/' && route !== '/_not-found' && !referencedRoutes.has(route))
  .sort();

const caseCollisions = [...known.keys()]
  .reduce((groups, route) => {
    const key = route.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), route]);
    return groups;
  }, new Map());
const collisions = [...caseCollisions.values()].filter((group) => group.length > 1);

console.log(`Route inventory: ${pages.size} pages, ${apis.size} route handlers (${dynamicRoutes.length} dynamic).`);
console.log(`Scanned ${SOURCE_FILES.length} source files for ${references.length} internal URL references.\n`);

console.log('Pages:');
for (const [route, file] of [...pages].sort()) console.log(`  ${route.includes('[') ? 'ƒ' : '○'} ${route.padEnd(34)} ${toPosix(relative(process.cwd(), file))}`);
console.log('\nRoute handlers:');
for (const route of [...apis.keys()].sort()) console.log(`  ƒ ${route}`);

console.log('\nReference resolution (non-exact results shown):');
for (const entry of resolved.filter((item) => item.verdict !== 'OK')) {
  const resolvesTo = entry.resolvedAs ? `${entry.resolvedAs}  ->  ${entry.route}` : entry.route;
  const target = entry.verdict === 'DYNAMIC' ? `${entry.target}  ->  ${resolvesTo}` : entry.target;
  console.log(`  ${entry.verdict.padEnd(14)} ${target}  (${entry.kind} in ${entry.file}:${entry.line})`);
}
const counts = resolved.reduce((tally, entry) => ({ ...tally, [entry.verdict]: (tally[entry.verdict] ?? 0) + 1 }), {});
console.log(`  totals: ${Object.entries(counts).map(([verdict, total]) => `${verdict}=${total}`).join('  ')}`);

if (unreferencedPages.length) console.log(`\nPage routes with no internal link pointing at them (informational):\n${unreferencedPages.map((route) => `  - ${route}`).join('\n')}`);
if (collisions.length) console.log(`\nCASE COLLISIONS (would break on Linux):\n${collisions.map((group) => `  - ${group.join(' / ')}`).join('\n')}`);

const blocking = problems.length + collisions.length;
console.log(`\n${blocking ? `FAIL: ${problems.length} unresolved reference(s), ${collisions.length} case collision(s).` : 'PASS: every internal URL reference resolves to a real route without case ambiguity.'}`);
process.exit(blocking ? 1 : 0);
