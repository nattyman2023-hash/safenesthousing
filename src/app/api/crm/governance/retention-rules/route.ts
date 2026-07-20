import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { retentionRuleCreateSchema } from '@/lib/crm-validation';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const user = await requirePermission('governance.manage');
    const rules = await db.dataRetentionRule.findMany({ where: { organisationId: user.organisationId }, orderBy: { resourceType: 'asc' } });
    return NextResponse.json({ rules });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to load retention rules.' : message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission('governance.manage');
    const parsed = retentionRuleCreateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the retention rule.' }, { status: 400 });
    const rule = await db.dataRetentionRule.create({ data: { organisationId: user.organisationId, resourceType: parsed.data.resourceType, retentionDays: parsed.data.retentionDays, legalBasisNote: parsed.data.legalBasisNote, active: parsed.data.active } });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'RETENTION_RULE_CREATED', resourceType: 'DataRetentionRule', resourceId: rule.id, after: { resourceType: rule.resourceType, retentionDays: rule.retentionDays, active: rule.active, legalBasisProvided: true } });
    return NextResponse.json({ ok: true, rule }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : message.includes('Unique constraint') ? 409 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to create the retention rule.' : status === 409 ? 'A rule already exists for that resource.' : message }, { status });
  }
}
