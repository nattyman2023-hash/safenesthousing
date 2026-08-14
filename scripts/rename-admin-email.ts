import { db } from '../src/lib/db';
import { audit } from '../src/lib/audit';
import { DEFAULT_ADMIN_EMAIL } from '../src/lib/admin';

function readArg(flag: string, fallback?: string) {
  const prefix = `--${flag}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  return value || fallback;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Rename an existing production administrator without creating a second account.
 *
 * Usage:
 *   tsx scripts/rename-admin-email.ts --from=old-address@example.org
 *
 * The source address is intentionally required so this cannot rename an arbitrary
 * staff account when run against a production database.
 */
async function main() {
  const from = readArg('from')?.trim().toLowerCase();
  const to = readArg('to', DEFAULT_ADMIN_EMAIL)!.trim().toLowerCase();

  if (!from || !isEmail(from) || !isEmail(to)) {
    console.error(`Usage: tsx scripts/rename-admin-email.ts --from=old-address@example.org [--to=${DEFAULT_ADMIN_EMAIL}]`);
    process.exitCode = 1;
    return;
  }

  if (from === to) {
    console.error('The source and destination email addresses must be different.');
    process.exitCode = 1;
    return;
  }

  const [source, destination] = await Promise.all([
    db.user.findUnique({ where: { email: from } }),
    db.user.findUnique({ where: { email: to }, select: { id: true } })
  ]);

  if (!source) {
    console.error(`No user exists with email ${from}.`);
    process.exitCode = 1;
    return;
  }
  if (destination) {
    console.error(`A user already exists with email ${to}; no changes were made.`);
    process.exitCode = 1;
    return;
  }
  if (!source.active) {
    console.error(`User ${from} is inactive; no changes were made.`);
    process.exitCode = 1;
    return;
  }

  await db.user.update({ where: { id: source.id }, data: { email: to } });
  await audit({ organisationId: source.organisationId, actorId: source.id, action: 'ADMIN_EMAIL_RENAMED', resourceType: 'User', resourceId: source.id, after: { from, to } });

  console.log(`Administrator email changed from ${from} to ${to}.`);
  console.log('The existing password, role labels, sessions, and audit history were retained.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await db.$disconnect(); });
