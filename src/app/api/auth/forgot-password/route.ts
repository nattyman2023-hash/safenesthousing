import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { hashToken } from '@/lib/auth';
import { config } from '@/lib/env';
import { sendSafeEmail } from '@/lib/mail';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { passwordResetRequestSchema } from '@/lib/crm-validation';

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limited = await rateLimit(`password-reset:${ip}`, 5, 15 * 60_000);
  if (!limited.allowed) return NextResponse.json({ message: 'If the account exists, a reset email will arrive shortly.' }, { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } });
  const parsed = passwordResetRequestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: 'If the account exists, a reset email will arrive shortly.' });
  const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } }).catch(() => null);
  if (user?.active) {
    const raw = randomBytes(32).toString('hex');
    await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 30 * 60_000) } });
    await audit({ organisationId: user.organisationId, action: 'PASSWORD_RESET_REQUESTED', resourceType: 'User', resourceId: user.id, ipAddress: ip });
    const link = `${config.appUrl}/staff/reset-password?token=${raw}`;
    await sendSafeEmail({ to: user.email, subject: 'Safe Nest — password reset', text: `A password reset was requested. Use this link within 30 minutes: ${link}`, html: `<p>A password reset was requested for your Safe Nest account.</p><p><a href="${link}">Reset your password</a> within 30 minutes.</p><p>If you did not request this, you can ignore this email.</p>` });
  }
  return NextResponse.json({ message: 'If the account exists, a reset email will arrive shortly.' });
}
