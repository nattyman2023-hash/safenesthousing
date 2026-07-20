import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createSession, mfaBypassEnabledForDev, roleRequiresMfa, verifyPassword } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const form = Object.fromEntries(await request.formData());
  const email = String(form.email ?? '').trim().toLowerCase(); const password = String(form.password ?? '');
  const ip = getClientIp(request);
  const limited = await rateLimit(`login:${ip}:${email}`, 8, 5 * 60_000);
  if (!limited.allowed) return NextResponse.json({ error: 'Too many sign-in attempts. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } });
  const user = await db.user.findUnique({ where: { email }, include: { organisation: true, memberships: { where: { active: true }, include: { role: true } } } }).catch(() => null);
  const valid = !!user && user.active && await verifyPassword(password, user.passwordHash);
  if (!valid) { if (user) { await db.loginAttempt.create({ data: { userId: user.id, email, success: false, ipAddress: ip } }); await audit({ organisationId: user.organisationId, actorId: user.id, action: 'LOGIN_FAILED', resourceType: 'User', resourceId: user.id, success: false, ipAddress: ip }); } return NextResponse.json({ error: 'Email or password not recognised.' }, { status: 401 }); }
  await db.loginAttempt.create({ data: { userId: user.id, email, success: true, ipAddress: ip } });
  const privilegedRole = user.memberships.some((membership) => roleRequiresMfa(membership.role.slug));
  const bypass = mfaBypassEnabledForDev();
  const mfaRequired = !bypass && (user.mfaRequired || privilegedRole);
  if (privilegedRole && !user.mfaRequired) {
    await db.user.update({ where: { id: user.id }, data: { mfaRequired: true } });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'MFA_POLICY_ENFORCED', resourceType: 'User', resourceId: user.id, after: { reason: 'privileged_role' } });
  }
  const mfaConfigured = mfaRequired ? await db.mfaMethod.count({ where: { userId: user.id, type: 'TOTP', verifiedAt: { not: null } } }) > 0 : false;
  await createSession(user.id, !mfaRequired);
  await audit({ organisationId: user.organisationId, actorId: user.id, action: mfaRequired ? 'LOGIN_PASSWORD_ACCEPTED' : 'LOGIN_SUCCESS', resourceType: 'User', resourceId: user.id, ipAddress: ip, after: mfaRequired ? { mfaRequired: true, mfaConfigured } : undefined });
  return NextResponse.json({ ok: true, mfaRequired, mfaConfigured });
}
