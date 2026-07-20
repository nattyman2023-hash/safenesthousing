import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { canViewRestricted, requirePermission } from '@/lib/auth';
import { caseNoteSchema } from '@/lib/crm-validation';

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requirePermission('clients.write');
    const parsed = caseNoteSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the case note.' }, { status: 400 });
    const client = await db.client.findFirst({ where: { id: params.id, organisationId: user.organisationId } });
    if (!client) return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    if (client.restricted && !canViewRestricted(user)) return NextResponse.json({ error: 'You are not authorised to access this client record.' }, { status: 403 });
    if (parsed.data.restricted && !user.memberships.some((membership) => ['super-administrator', 'organisation-administrator', 'safeguarding-lead', 'service-manager', 'support-lead'].includes(membership.role.slug))) return NextResponse.json({ error: 'You are not authorised to create a restricted note.' }, { status: 403 });
    const note = await db.$transaction(async (tx) => {
      const created = await tx.caseNote.create({ data: { clientId: client.id, authorId: user.id, contactType: parsed.data.contactType, category: parsed.data.category, note: parsed.data.note, outcome: parsed.data.outcome, followUpDate: parsed.data.followUpDate ? new Date(parsed.data.followUpDate) : undefined, restricted: parsed.data.restricted, finalised: true } });
      await tx.caseNoteVersion.create({ data: { caseNoteId: created.id, authorId: user.id, content: parsed.data.note, reason: 'Initial finalised note' } });
      return created;
    });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'CASE_NOTE_CREATED', resourceType: 'CaseNote', resourceId: note.id, after: { clientId: client.id, category: note.category, restricted: note.restricted } });
    return NextResponse.json({ id: note.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to save the case note.' : message }, { status });
  }
}
