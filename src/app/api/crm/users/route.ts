import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { config } from '@/lib/env';
import { hasRole, hashPassword, hashToken, requirePermission } from '@/lib/auth';
import { userInviteSchema } from '@/lib/crm-validation';
import { db } from '@/lib/db';
import { sendSafeEmail } from '@/lib/mail';

export async function POST(request: Request) {
  try {
    const actor = await requirePermission('users.manage');
    const parsed = userInviteSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the invitation details.' }, { status: 400 });
    const role = await db.role.findFirst({ where: { organisationId: actor.organisationId, slug: parsed.data.roleSlug } });
    if (!role) return NextResponse.json({ error: 'Choose a role from this organisation.' }, { status: 400 });
    if (role.slug === 'super-administrator' && !hasRole(actor, ['super-administrator'])) return NextResponse.json({ error: 'Only a super administrator may grant the super-administrator role.' }, { status: 403 });
    const existing = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (existing) return NextResponse.json({ error: 'That email address is already registered.' }, { status: 409 });
    const rawToken = randomBytes(32).toString('hex');
    const temporaryHash = await hashPassword(randomBytes(32).toString('hex'));
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { organisationId: actor.organisationId, email: parsed.data.email.toLowerCase(), name: parsed.data.name, jobTitle: parsed.data.jobTitle, passwordHash: temporaryHash, mfaRequired: true } });
      await tx.membership.create({ data: { organisationId: actor.organisationId, userId: created.id, roleId: role.id } });
      await tx.passwordResetToken.create({ data: { userId: created.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 30 * 60_000) } });
      return created;
    });
    const resetUrl = `${config.appUrl}/staff/reset-password?token=${rawToken}`;
    const email = await sendSafeEmail({ to: user.email, subject: 'Safe Nest account invitation', text: `An account has been created for you. Set your password within 30 minutes: ${resetUrl}`, html: `<p>An account has been created for you at Safe Nest.</p><p><a href="${resetUrl}">Set your password</a> within 30 minutes.</p>` });
    await audit({ organisationId: actor.organisationId, actorId: actor.id, action: 'USER_INVITED', resourceType: 'User', resourceId: user.id, after: { role: role.slug, emailSent: email.sent } });
    return NextResponse.json({ id: user.id, email: user.email, emailSent: email.sent });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to invite the user.' : message }, { status });
  }
}
