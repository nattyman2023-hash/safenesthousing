import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { hashPassword, hashToken } from '@/lib/auth';
import { passwordResetSchema } from '@/lib/crm-validation';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const limited = await rateLimit(`password-reset-complete:${getClientIp(request)}`, 8, 15 * 60_000);
  if (!limited.allowed) return NextResponse.json({ error: 'Too many reset attempts. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } });
  const parsed = passwordResetSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Use a valid reset link and a password of at least 12 characters.' }, { status: 400 });
  const token = await db.passwordResetToken.findFirst({ where: { tokenHash: hashToken(parsed.data.token), usedAt: null, expiresAt: { gt: new Date() } }, include: { user: true } });
  if (!token || !token.user.active) return NextResponse.json({ error: 'This reset link is invalid or expired.' }, { status: 400 });
  const passwordHash = await hashPassword(parsed.data.password);
  await db.$transaction([db.user.update({ where: { id: token.userId }, data: { passwordHash } }), db.passwordResetToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }), db.userSession.updateMany({ where: { userId: token.userId, revokedAt: null }, data: { revokedAt: new Date() } })]);
  await audit({ organisationId: token.user.organisationId, action: 'PASSWORD_RESET_COMPLETED', resourceType: 'User', resourceId: token.userId });
  return NextResponse.json({ ok: true });
}
