import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
      if (match) return match[1].replace(/^['"]|['"]$/g, '');
    }
  } catch { /* fall through to Prisma's own default resolution */ }
  return undefined;
}

const databaseUrl = loadDatabaseUrl();
export const prisma = new PrismaClient(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined);

/**
 * The e2e suite drives the real MFA enrollment screen rather than mocking it, so a staff
 * member's authenticator state must start unconfigured before each run — otherwise the
 * "set up MFA" step is skipped and there is no way to recover the secret needed to log in again.
 */
export async function resetStaffMfa(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`Seed fixture missing: no user with email ${email}. Run "npm run db:seed" before the e2e suite.`);
  await prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } });
  await prisma.mfaMethod.deleteMany({ where: { userId: user.id } });
  await prisma.userSession.deleteMany({ where: { userId: user.id } });
}
