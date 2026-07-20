import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { siteSettingsUpdateSchema } from '@/lib/crm-validation';
import { db } from '@/lib/db';

export async function PATCH(request: Request) {
  try {
    const user = await requirePermission('content.write');
    const parsed = siteSettingsUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the setting values.' }, { status: 400 });
    const current = await db.siteSetting.findMany({ where: { organisationId: user.organisationId, key: { in: parsed.data.settings.map((setting) => setting.key) } } });
    await db.$transaction(parsed.data.settings.map((setting) => db.siteSetting.upsert({ where: { organisationId_key: { organisationId: user.organisationId, key: setting.key } }, update: { value: setting.value }, create: { organisationId: user.organisationId, key: setting.key, value: setting.value } })));
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'SITE_SETTINGS_UPDATED', resourceType: 'SiteSetting', after: { keys: parsed.data.settings.map((setting) => setting.key), changed: parsed.data.settings.filter((setting) => current.find((row) => row.key === setting.key)?.value !== setting.value).map((setting) => setting.key) } });
    return NextResponse.json({ ok: true, keys: parsed.data.settings.map((setting) => setting.key) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to save organisation settings.' : message }, { status });
  }
}
