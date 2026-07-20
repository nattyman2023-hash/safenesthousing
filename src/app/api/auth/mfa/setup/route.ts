import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getCurrentSession } from '@/lib/auth';
import { buildOtpAuthUri, decryptMfaSecret, encryptMfaSecret, generateMfaSecret } from '@/lib/mfa';
import { rateLimit } from '@/lib/rate-limit';

export async function POST() {
  const session = await getCurrentSession();
  if (!session?.user.active) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 });
  const limited = await rateLimit(`mfa-setup:${session.user.id}`, 3, 15 * 60_000);
  if (!limited.allowed) return NextResponse.json({ error: 'Too many MFA setup attempts. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } });
  const existing = await db.mfaMethod.findFirst({ where: { userId: session.user.id, type: 'TOTP', verifiedAt: null }, orderBy: { createdAt: 'desc' } });
  if (existing) {
    const secret = decryptMfaSecret(existing.secretCipher);
    return NextResponse.json({ secret, otpauthUri: buildOtpAuthUri(secret, session.user.email), configured: false });
  }
  const secret = generateMfaSecret();
  await db.mfaMethod.deleteMany({ where: { userId: session.user.id, type: 'TOTP', verifiedAt: null } });
  await db.mfaMethod.create({ data: { userId: session.user.id, type: 'TOTP', secretCipher: encryptMfaSecret(secret) } });
  await audit({ organisationId: session.user.organisationId, actorId: session.user.id, action: 'MFA_SETUP_STARTED', resourceType: 'User', resourceId: session.user.id });
  return NextResponse.json({ secret, otpauthUri: buildOtpAuthUri(secret, session.user.email), configured: false });
}
