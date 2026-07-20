import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getCurrentSession } from '@/lib/auth';
import { decryptMfaSecret, generateRecoveryCodes, hashRecoveryCode, isRecoveryCode, verifyTotpCode } from '@/lib/mfa';
import { mfaCodeSchema } from '@/lib/mfa-validation';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session?.user.active) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 });
  const limited = await rateLimit(`mfa:${session.user.id}`, 8, 5 * 60_000);
  if (!limited.allowed) return NextResponse.json({ error: 'Too many MFA attempts. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } });
  const parsed = mfaCodeSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Enter a valid authentication code.' }, { status: 400 });
  const method = await db.mfaMethod.findFirst({ where: { userId: session.user.id, type: 'TOTP' }, orderBy: [{ verifiedAt: 'desc' }, { createdAt: 'desc' }] });
  const input = parsed.data.code.trim();
  const usingRecoveryCode = isRecoveryCode(input);
  const validTotp = !usingRecoveryCode && !!method && verifyTotpCode(decryptMfaSecret(method.secretCipher), input);
  if (!method || (!usingRecoveryCode && !validTotp)) {
    await audit({ organisationId: session.user.organisationId, actorId: session.user.id, action: 'MFA_FAILED', resourceType: 'User', resourceId: session.user.id, success: false });
    return NextResponse.json({ error: 'That authentication or recovery code was not accepted.' }, { status: 401 });
  }
  const issueRecoveryCodes = !method.recoveryCodesIssuedAt;
  const now = new Date();
  const outcome = await db.$transaction(async (tx) => {
    if (usingRecoveryCode) {
      const recoveryCode = await tx.mfaRecoveryCode.findFirst({ where: { userId: session.user.id, codeHash: hashRecoveryCode(input), usedAt: null } });
      if (!recoveryCode) return { valid: false, recoveryCodes: [] as string[] };
      const consumed = await tx.mfaRecoveryCode.updateMany({ where: { id: recoveryCode.id, usedAt: null }, data: { usedAt: now } });
      if (consumed.count !== 1) return { valid: false, recoveryCodes: [] as string[] };
    }
    const recoveryCodes = issueRecoveryCodes ? generateRecoveryCodes() : [];
    await tx.mfaMethod.update({ where: { id: method.id }, data: { verifiedAt: method.verifiedAt ?? now, recoveryCodesIssuedAt: issueRecoveryCodes ? now : undefined } });
    await tx.userSession.update({ where: { id: session.id }, data: { mfaVerifiedAt: now } });
    for (const code of recoveryCodes) await tx.mfaRecoveryCode.create({ data: { userId: session.user.id, codeHash: hashRecoveryCode(code) } });
    return { valid: true, recoveryCodes };
  });
  if (!outcome.valid) {
    await audit({ organisationId: session.user.organisationId, actorId: session.user.id, action: 'MFA_FAILED', resourceType: 'User', resourceId: session.user.id, success: false });
    return NextResponse.json({ error: 'That authentication or recovery code was not accepted.' }, { status: 401 });
  }
  await audit({ organisationId: session.user.organisationId, actorId: session.user.id, action: usingRecoveryCode ? 'MFA_RECOVERY_USED' : method.verifiedAt ? 'MFA_SUCCESS' : 'MFA_ENROLLED', resourceType: 'User', resourceId: session.user.id, after: { recoveryCodesIssued: issueRecoveryCodes, recoveryCodeUsed: usingRecoveryCode } });
  return NextResponse.json({ ok: true, recoveryCodes: outcome.recoveryCodes.length ? outcome.recoveryCodes : undefined });
}
