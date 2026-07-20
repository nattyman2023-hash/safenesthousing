import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from '../src/lib/db';
import { audit } from '../src/lib/audit';
import { config } from '../src/lib/env';
import { sendSafeEmail, mailAdapterStatus } from '../src/lib/mail';
import { userInviteSchema } from '../src/lib/crm-validation';
import { ensureRbac } from '../prisma/rbac-definitions';

/**
 * Controlled first-administrator bootstrap for a production environment.
 *
 * Unlike `npm run db:seed` (which must never run in production because it also inserts
 * fictional demo clients, referrals, and incidents), this script only creates the structural
 * RBAC scaffolding plus exactly one real administrator, using the same invite pattern as
 * POST /api/crm/users: an unusable random password hash and a one-time, 30-minute password-reset
 * link. Run once per environment. Re-running with the same email refuses rather than silently
 * resetting an existing account.
 *
 * Usage:
 *   tsx scripts/bootstrap-admin.ts --email=admin@example.org --name="Jordan Blake" [options]
 *
 * Required:
 *   --email           Work email for the first administrator
 *   --name            Full name
 *
 * Optional:
 *   --job-title       Job title (default: "Organisation administrator")
 *   --role            organisation-administrator (default) or super-administrator
 *   --org-name        Organisation name (default: "Safe Nest Housing & Support")
 *   --org-slug        Organisation slug (default: "safe-nest")
 *
 * Environment variable fallbacks: BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME,
 * BOOTSTRAP_ADMIN_JOB_TITLE, BOOTSTRAP_ADMIN_ROLE, BOOTSTRAP_ORG_NAME, BOOTSTRAP_ORG_SLUG.
 * Explicit CLI flags take precedence over environment variables.
 */

const ALLOWED_ROLES = ['organisation-administrator', 'super-administrator'] as const;

function readArg(flag: string, envVar: string, fallback?: string) {
  const prefix = `--${flag}=`;
  const fromArgs = process.argv.find((arg) => arg.startsWith(prefix));
  if (fromArgs) return fromArgs.slice(prefix.length);
  if (process.env[envVar]) return process.env[envVar];
  return fallback;
}

function hashToken(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function main() {
  const email = readArg('email', 'BOOTSTRAP_ADMIN_EMAIL')?.trim().toLowerCase();
  const name = readArg('name', 'BOOTSTRAP_ADMIN_NAME')?.trim();
  const jobTitle = readArg('job-title', 'BOOTSTRAP_ADMIN_JOB_TITLE', 'Organisation administrator');
  const role = readArg('role', 'BOOTSTRAP_ADMIN_ROLE', 'organisation-administrator');
  const orgName = readArg('org-name', 'BOOTSTRAP_ORG_NAME', 'Safe Nest Housing & Support')!;
  const orgSlug = readArg('org-slug', 'BOOTSTRAP_ORG_SLUG', 'safe-nest')!;

  if (!email || !name) {
    console.error('Usage: tsx scripts/bootstrap-admin.ts --email=admin@example.org --name="Jordan Blake" [--job-title=...] [--role=organisation-administrator|super-administrator] [--org-name=...] [--org-slug=...]');
    process.exitCode = 1;
    return;
  }

  if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
    console.error(`--role must be one of: ${ALLOWED_ROLES.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const parsed = userInviteSchema.omit({ roleSlug: true }).safeParse({ email, name, jobTitle });
  if (!parsed.success) {
    console.error(`Check the provided details: ${parsed.error.issues[0]?.message ?? 'invalid input'}`);
    process.exitCode = 1;
    return;
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    console.error(`A user with email ${email} already exists. Use the CRM's "Invite user" flow to add further administrators, or choose a different email.`);
    process.exitCode = 1;
    return;
  }

  const organisation = await db.organisation.upsert({
    where: { slug: orgSlug },
    update: {},
    create: { name: orgName, slug: orgSlug }
  });

  const { roles } = await ensureRbac(db, organisation.id);
  const roleId = roles.get(role);
  if (!roleId) {
    console.error(`Role "${role}" was not created by the RBAC scaffolding — this indicates a bug in prisma/rbac-definitions.ts.`);
    process.exitCode = 1;
    return;
  }

  const temporaryHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
  const rawToken = randomBytes(32).toString('hex');
  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({ data: { organisationId: organisation.id, email, name: parsed.data.name, jobTitle: parsed.data.jobTitle, passwordHash: temporaryHash, mfaRequired: true } });
    await tx.membership.create({ data: { organisationId: organisation.id, userId: created.id, roleId } });
    await tx.passwordResetToken.create({ data: { userId: created.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 30 * 60_000) } });
    return created;
  });

  await audit({ organisationId: organisation.id, actorId: user.id, action: 'ADMIN_BOOTSTRAPPED', resourceType: 'User', resourceId: user.id, after: { role, email } });

  const setupUrl = `${config.appUrl}/staff/reset-password?token=${rawToken}`;
  let emailSent = false;
  if (mailAdapterStatus().configured) {
    try {
      const result = await sendSafeEmail({ to: user.email, subject: 'Safe Nest — set up your administrator account', text: `An administrator account has been created for you. Set your password within 30 minutes: ${setupUrl}`, html: `<p>An administrator account has been created for you at Safe Nest.</p><p><a href="${setupUrl}">Set your password</a> within 30 minutes.</p>` });
      emailSent = result.sent;
    } catch (error) {
      console.warn('Could not send the setup email — the one-time link below still works.', error instanceof Error ? error.message : error);
    }
  }

  console.log(`Organisation: ${organisation.name} (${organisation.slug})`);
  console.log(`Administrator created: ${user.email} — role: ${role}`);
  console.log(`Setup email sent: ${emailSent ? 'yes' : 'no'}`);
  console.log(`One-time setup link (expires in 30 minutes, use once): ${setupUrl}`);
  if (!emailSent) console.log('Deliver this link to the administrator through a secure, private channel — it is not logged anywhere else.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await db.$disconnect(); });
