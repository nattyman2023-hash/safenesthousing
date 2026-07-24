import { db } from '../src/lib/db';
import { audit } from '../src/lib/audit';
import { DEFAULT_ADMIN_EMAIL } from '../src/lib/admin';
import { hashPassword } from '../src/lib/auth';

const ADMIN_ROLES = new Set(['super-administrator', 'organisation-administrator']);

function readArg(flag: string, fallback?: string) {
  const prefix = `--${flag}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  return value || fallback;
}

/**
 * Set an administrator password without putting the password in source control or
 * shell command history. Supply ADMIN_PASSWORD through the host's secret/session
 * environment, then unset it after this command completes.
 *
 * Usage:
 *   ADMIN_PASSWORD='temporary-value' tsx scripts/set-admin-password.ts
 *   ADMIN_PASSWORD='temporary-value' tsx scripts/set-admin-password.ts --email=admin@example.org
 */
async function main() {
  const email = readArg('email', DEFAULT_ADMIN_EMAIL)!.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!password || password.length < 12) {
    console.error('Set ADMIN_PASSWORD to a password of at least 12 characters in the host environment. It is never printed or stored by this command.');
    process.exitCode = 1;
    return;
  }

  const user = await db.user.findUnique({ where: { email }, include: { memberships: { include: { role: true } } } });
  if (!user) {
    console.error(`No user exists with email ${email}.`);
    process.exitCode = 1;
    return;
  }
  if (!user.active || !user.memberships.some((membership) => membership.active && ADMIN_ROLES.has(membership.role.slug))) {
    console.error(`User ${email} is not an active administrator; no changes were made.`);
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(password);
  delete process.env.ADMIN_PASSWORD;
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash } }),
    db.userSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
  ]);
  await audit({ organisationId: user.organisationId, actorId: user.id, action: 'ADMIN_PASSWORD_CHANGED', resourceType: 'User', resourceId: user.id, after: { email, sessionsRevoked: true } });

  console.log(`Administrator password updated for ${email}. Existing sessions were revoked.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await db.$disconnect(); });
