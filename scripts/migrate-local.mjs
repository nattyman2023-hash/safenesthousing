import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL ?? 'file:./dev.db';
const migrationRoot = resolve('prisma', 'migrations');
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';

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
  const result = spawnSync(`${command} ${args.join(' ')}`, { stdio: 'inherit', shell: true, env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? '0' } });
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
if (!existsSync(databaseFile)) {
  for (const migrationName of migrationNames) executeMigration(resolve(migrationRoot, migrationName, 'migration.sql'));
  process.exit(0);
}

const prisma = new PrismaClient();
const sessionColumns = await prisma.$queryRawUnsafe('PRAGMA table_info("UserSession")');
const recoveryTables = await prisma.$queryRawUnsafe('SELECT name FROM sqlite_master WHERE type = \'table\' AND name = \'MfaRecoveryCode\'');
const documentColumns = await prisma.$queryRawUnsafe('PRAGMA table_info("Document")');
const retentionColumns = await prisma.$queryRawUnsafe('PRAGMA table_info("DataRetentionRule")');
const subjectRequestColumns = await prisma.$queryRawUnsafe('PRAGMA table_info("DataSubjectRequest")');
const retentionReviewTables = await prisma.$queryRawUnsafe('SELECT name FROM sqlite_master WHERE type = \'table\' AND name = \'DataRetentionReviewRun\'');
await prisma.$disconnect();
if (!sessionColumns.some((column) => column.name === 'mfaVerifiedAt')) {
  const migrationName = migrationNames.find((name) => name.startsWith('0002_'));
  if (migrationName) executeMigration(resolve(migrationRoot, migrationName, 'migration.sql'));
}
if (!recoveryTables.length) {
  const migrationName = migrationNames.find((name) => name.startsWith('0003_'));
  if (migrationName) executeMigration(resolve(migrationRoot, migrationName, 'migration.sql'));
}
if (!documentColumns.some((column) => column.name === 'sha256')) {
  const migrationName = migrationNames.find((name) => name.startsWith('0004_'));
  if (migrationName) executeMigration(resolve(migrationRoot, migrationName, 'migration.sql'));
}
if (!retentionColumns.some((column) => column.name === 'updatedAt') || !subjectRequestColumns.some((column) => column.name === 'legalHold')) {
  const migrationName = migrationNames.find((name) => name.startsWith('0005_'));
  if (migrationName) executeMigration(resolve(migrationRoot, migrationName, 'migration.sql'));
}
if (!retentionReviewTables.length) {
  const migrationName = migrationNames.find((name) => name.startsWith('0006_'));
  if (migrationName) executeMigration(resolve(migrationRoot, migrationName, 'migration.sql'));
}
console.log(`Local database checked at ${databaseFile}.`);
