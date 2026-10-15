import { copyFileSync, existsSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/**
 * Applies the reviewed SQL migrations to the configured database.
 *
 * `npm run db:migrate` (development) and `npm run db:migrate:deploy` (deployment) both run this
 * script, so there is exactly one migration path and it behaves the same locally and on the server.
 * For a non-`file:` database it hands over to `prisma migrate deploy`; for SQLite (the current
 * production target — a persistent `file:/.../production.db` outside the web root) it applies the
 * migration SQL directly, because Prisma's migration engine refuses to run against a database file
 * that a running server is sharing.
 *
 * Safety properties, in order:
 *  1. It never resets, drops or recreates a database, and it never seeds data.
 *  2. It refuses to run in production without an explicit DATABASE_URL, because the fallback below
 *     resolves to `prisma/dev.db` — silently migrating a development file while the real database
 *     stayed on an older schema is the one failure mode worth stopping a deployment over.
 *  3. It copies the database (and any SQLite WAL sidecars) to a timestamped `.backup-*` file before
 *     the first change, so a failed migration can always be rolled back by hand.
 *  4. It counts the live business tables before and after, and stops the deployment if any fell.
 *  5. After applying, it re-checks the schema it was supposed to create and stops the deployment if
 *     anything is still missing, rather than starting the app against an outdated schema.
 *  6. Every migration directory on disk must be registered below. A new migration that nobody
 *     registered fails the run instead of being quietly skipped.
 */

const databaseUrl = process.env.DATABASE_URL ?? 'file:./dev.db';
const migrationRoot = resolve('prisma', 'migrations');
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';

/** The base schema; only ever applied to a database file that does not exist yet. */
const BASE_MIGRATION_PREFIX = '0001_';

/** Rows that must never be lost. Counted before and after every migration run. */
const PROTECTED_TABLES = ['Client', 'Placement', 'Document', 'Incident', 'CaseNote', 'SupportPlan', 'Referral', 'User'];

function looksLikeProductionDatabase(url) {
  const normalized = decodeURIComponent(url).toLowerCase();
  return /(?:^|[\\/:._-])(prod|production)(?=$|[\\/:._?#-])/.test(normalized);
}

if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
  console.error('Refusing to apply migrations: NODE_ENV=production but DATABASE_URL is not set. Without it this script would fall back to prisma/dev.db and leave the real database on an outdated schema.');
  process.exit(1);
}

if (process.env.NODE_ENV !== 'production' && looksLikeProductionDatabase(databaseUrl)) {
  console.error('Refusing to migrate a database URL that looks like a production database outside NODE_ENV=production.');
  process.exit(1);
}

function quoteArg(value) {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function executeMigration(file) {
  // --schema (not --url) so this resolves the sqlite file exactly like the generated Prisma
  // Client does (relative to prisma/schema.prisma) — a bare --url override resolves relative to
  // the current working directory instead, silently targeting a different, empty database file.
  // shell: true with a manually quoted command string — spawning the npx/npx.cmd wrapper via an
  // args array throws EINVAL on Windows, particularly with a path containing spaces such as this
  // project's own directory, and shell:true alone does not quote array args for cmd.exe.
  const args = ['prisma', 'db', 'execute', '--file', quoteArg(file), '--schema', quoteArg(resolve('prisma', 'schema.prisma'))];
  const result = spawnSync(`${command} ${args.join(' ')}`, { stdio: 'inherit', shell: true, env: process.env });
  if (result.error) { console.error(`Failed to run prisma db execute for ${file}:`, result.error); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!databaseUrl.startsWith('file:')) {
  const result = spawnSync(command, ['prisma', 'migrate', 'deploy'], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

const relativeDatabase = databaseUrl.slice('file:'.length).replace(/^\.\//, '');
const databaseFile = resolve('prisma', relativeDatabase);
const migrationNames = (await readdir(migrationRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

async function columnsOf(rows) {
  return rows.map((row) => String(row.name));
}

/** SQLite has no information schema; the table and column lists are the schema. */
async function tableNames(client, wanted) {
  const list = wanted.map((name) => `'${name.replace(/'/g, "''")}'`).join(', ');
  const rows = await client.$queryRawUnsafe(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${list})`);
  return rows.map((row) => String(row.name));
}

const SUPPORT_OPERATION_TABLES = ['PenPortrait', 'RiskAssessment', 'SafeWellCheck', 'MoveChecklist', 'MoveChecklistItem', 'MaintenanceTicket', 'Appointment', 'Concern', 'Complaint', 'PropertyComplianceRecord', 'PolicyResource', 'SupportPlanReview'];

async function documentColumns(client) { return columnsOf(await client.$queryRawUnsafe('PRAGMA table_info("Document")')); }
async function clientColumns(client) { return columnsOf(await client.$queryRawUnsafe('PRAGMA table_info("Client")')); }
async function sessionColumns(client) { return columnsOf(await client.$queryRawUnsafe('PRAGMA table_info("UserSession")')); }
async function retentionColumns(client) { return columnsOf(await client.$queryRawUnsafe('PRAGMA table_info("DataRetentionRule")')); }
async function subjectRequestColumns(client) { return columnsOf(await client.$queryRawUnsafe('PRAGMA table_info("DataSubjectRequest")')); }

/**
 * One entry per migration file. `applied` is the single source of truth for both "is this migration
 * already in the database?" and "did this migration actually work?", so a database is never declared
 * up to date on the strength of a successful command exit alone.
 */
const MIGRATION_CHECKS = [
  { prefix: '0002_', summary: 'sign-in session state', applied: async (client) => (await sessionColumns(client)).includes('mfaVerifiedAt') },
  { prefix: '0003_', summary: 'multi-factor recovery codes', applied: async (client) => (await tableNames(client, ['MfaRecoveryCode'])).length === 1 },
  { prefix: '0004_', summary: 'document integrity metadata', applied: async (client) => (await documentColumns(client)).includes('sha256') },
  { prefix: '0005_', summary: 'governance workflow fields', applied: async (client) => (await retentionColumns(client)).includes('updatedAt') && (await subjectRequestColumns(client)).includes('legalHold') },
  { prefix: '0006_', summary: 'retention review runs', applied: async (client) => (await tableNames(client, ['DataRetentionReviewRun'])).length === 1 },
  { prefix: '0007_', summary: 'organisation secrets', applied: async (client) => (await tableNames(client, ['OrganisationSecret'])).length === 1 },
  { prefix: '0008_', summary: 'client profile, documents and relationships', applied: async (client) => (await clientColumns(client)).includes('phone') && (await tableNames(client, ['RelatedPerson', 'ClientRelationship'])).length === 2 },
  { prefix: '0009_', summary: 'support and housing operations', applied: async (client) => (await clientColumns(client)).includes('supportWorkerId') && (await tableNames(client, SUPPORT_OPERATION_TABLES)).length === SUPPORT_OPERATION_TABLES.length },
  { prefix: '0010_', summary: 'document descriptions', applied: async (client) => (await documentColumns(client)).includes('description') },
  { prefix: '0011_', summary: 'document dates', applied: async (client) => (await documentColumns(client)).includes('documentDate') }
];

// Completion guard: every migration on disk must be registered above, so a future migration can
// never be skipped silently by a deployment that then reports success.
const unregistered = migrationNames.filter((name) => !name.startsWith(BASE_MIGRATION_PREFIX) && !MIGRATION_CHECKS.some((check) => name.startsWith(check.prefix)));
const missingFiles = MIGRATION_CHECKS.filter((check) => !migrationNames.some((name) => name.startsWith(check.prefix)));
if (unregistered.length) {
  console.error(`Refusing to migrate: ${unregistered.join(', ')} ${unregistered.length === 1 ? 'is' : 'are'} not registered in scripts/migrate-local.mjs, so ${unregistered.length === 1 ? 'it' : 'they'} would be skipped silently. Add a schema check for ${unregistered.length === 1 ? 'it' : 'them'} before deploying.`);
  process.exit(1);
}
if (missingFiles.length) {
  console.error(`Refusing to migrate: expected migration file(s) missing for ${missingFiles.map((check) => check.prefix).join(', ')}.`);
  process.exit(1);
}

async function rowCounts(client) {
  const counts = {};
  for (const table of PROTECTED_TABLES) {
    try {
      const rows = await client.$queryRawUnsafe(`SELECT COUNT(*) AS count FROM "${table}"`);
      counts[table] = Number(rows[0]?.count ?? 0);
    } catch { /* the table does not exist yet — this run is about to create it */ }
  }
  return counts;
}

async function pendingMigrations(client) {
  const pending = [];
  for (const check of MIGRATION_CHECKS) if (!(await check.applied(client))) pending.push(check);
  return pending;
}
if (!existsSync(databaseFile)) {
  console.log(`No database at ${databaseFile} — applying the full migration history to create it.`);
  for (const name of migrationNames) executeMigration(resolve(migrationRoot, name, 'migration.sql'));
  const created = new PrismaClient();
  const missing = (await pendingMigrations(created)).map((check) => check.prefix);
  await created.$disconnect();
  if (missing.length) {
    console.error(`New database failed verification for ${missing.join(', ')}. Do not start the application.`);
    process.exit(1);
  }
  console.log(`Database created and verified at ${databaseFile}.`);
  process.exit(0);
}

const probe = new PrismaClient();
const before = await rowCounts(probe);
const pending = await pendingMigrations(probe);
await probe.$disconnect();

if (!pending.length) {
  console.log(`Database at ${databaseFile} is already up to date — no migration applied, nothing changed.`);
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = `${databaseFile}.backup-${stamp}`;
copyFileSync(databaseFile, backupFile);
for (const suffix of ['-wal', '-shm', '-journal']) {
  const sidecar = `${databaseFile}${suffix}`;
  if (existsSync(sidecar)) copyFileSync(sidecar, `${backupFile}${suffix}`);
}
if (statSync(backupFile).size !== statSync(databaseFile).size) {
  console.error(`Refusing to migrate: the backup at ${backupFile} does not match the size of ${databaseFile}.`);
  process.exit(1);
}
console.log(`Backup written to ${backupFile} (${statSync(backupFile).size} bytes) before applying ${pending.length} migration(s).`);

for (const check of pending) {
  const migrationName = migrationNames.find((name) => name.startsWith(check.prefix));
  console.log(`==> Applying ${migrationName} (${check.summary})`);
  executeMigration(resolve(migrationRoot, migrationName, 'migration.sql'));
}

const verifier = new PrismaClient();
const stillMissing = (await pendingMigrations(verifier)).map((check) => check.prefix);
const after = await rowCounts(verifier);
await verifier.$disconnect();

const lost = PROTECTED_TABLES.filter((table) => table in before && table in after && after[table] < before[table]);
console.log(`Rows before: ${PROTECTED_TABLES.map((table) => `${table}=${before[table] ?? 'n/a'}`).join(', ')}`);
console.log(`Rows after:  ${PROTECTED_TABLES.map((table) => `${table}=${after[table] ?? 'n/a'}`).join(', ')}`);

if (lost.length) {
  console.error(`Migration stopped: row counts fell in ${lost.join(', ')}. Restore ${backupFile} over ${databaseFile} and review before retrying.`);
  process.exit(1);
}
if (stillMissing.length) {
  console.error(`Migration applied but verification failed for ${stillMissing.join(', ')}. Do not start the application. Restore ${backupFile} over ${databaseFile} if needed.`);
  process.exit(1);
}

console.log(`Migrations applied and verified at ${databaseFile}. Backup kept at ${backupFile}.`);
console.log("SQLite file databases are tracked by the schema checks above, not by Prisma's _prisma_migrations table — never run `prisma migrate deploy` or `prisma migrate reset` against this file.");
