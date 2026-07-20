import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { retentionRuleUpdateSchema } from '@/lib/crm-validation';
import { db } from '@/lib/db';

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requirePermission('governance.manage');
    const parsed = retentionRuleUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the retention rule.' }, { status: 400 });
    const current = await db.dataRetentionRule.findFirst({ where: { id: params.id, organisationId: user.organisationId } });
    if (!current) return NextResponse.json({ error: 'Retention rule not found.' }, { status: 404 });
    const rule = await db.dataRetentionRule.update({ where: { id: current.id }, data: { retentionDays: parsed.data.retentionDays, legalBasisNote: parsed.data.legalBasisNote, active: parsed.data.active } });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'RETENTION_RULE_UPDATED', resourceType: 'DataRetentionRule', resourceId: rule.id, before: { retentionDays: current.retentionDays, active: current.active, legalBasisProvided: Boolean(current.legalBasisNote) }, after: { retentionDays: rule.retentionDays, active: rule.active, legalBasisProvided: Boolean(rule.legalBasisNote) } });
    return NextResponse.json({ ok: true, rule });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to update the retention rule.' : message }, { status });
  }
}
