import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { EMAILIT_API_KEY_SETTING } from '@/lib/email-settings';
import { emailitApiKeySchema } from '@/lib/crm-validation';
import { encryptSecret } from '@/lib/secrets';

export async function GET() {
  try {
    const user = await requireUser();
    const record = await db.organisationSecret.findUnique({ where: { organisationId_key: { organisationId: user.organisationId, key: EMAILIT_API_KEY_SETTING } }, select: { updatedAt: true } });
    return NextResponse.json({ configured: !!record, updatedAt: record?.updatedAt.toISOString() ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to load email settings.' : message }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const parsed = emailitApiKeySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Enter an Emailit API key.' }, { status: 400 });
    const current = await db.organisationSecret.findUnique({ where: { organisationId_key: { organisationId: user.organisationId, key: EMAILIT_API_KEY_SETTING } }, select: { id: true } });
    const secretCipher = encryptSecret(parsed.data.apiKey);
    await db.organisationSecret.upsert({
      where: { organisationId_key: { organisationId: user.organisationId, key: EMAILIT_API_KEY_SETTING } },
      update: { secretCipher },
      create: { organisationId: user.organisationId, key: EMAILIT_API_KEY_SETTING, secretCipher }
    });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'EMAILIT_API_KEY_UPDATED', resourceType: 'OrganisationSecret', after: { key: EMAILIT_API_KEY_SETTING, configured: true, replaced: !!current } });
    return NextResponse.json({ ok: true, configured: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to save email settings.' : message }, { status });
  }
}
