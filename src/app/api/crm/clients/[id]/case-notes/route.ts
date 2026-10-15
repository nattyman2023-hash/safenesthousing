import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { caseNoteSchema } from '@/lib/crm-validation';
import { contactCountsAsSupport, nextContactDueAt } from '@/lib/contact-tracking';

/** Records a finalised case note. The same row is the contact log: recording a contact also sets
 * when the next planned contact falls due for that person. */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUser();
    const parsed = caseNoteSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the case note.' }, { status: 400 });
    const client = await db.client.findFirst({ where: { id: params.id, organisationId: user.organisationId } });
    if (!client) return NextResponse.json({ error: 'Client not found.' }, { status: 404 });

    const data = parsed.data;
    const occurredAt = data.occurredAt ? new Date(data.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) return NextResponse.json({ error: 'Enter a valid contact date and time.' }, { status: 400 });
    const completed = data.completed ?? true;
    const meaningful = data.meaningful ?? true;
    const countedAsSupport = contactCountsAsSupport({ completed, meaningful });
    const nextDueAt = countedAsSupport ? nextContactDueAt(occurredAt, client.contactFrequencyDays) : undefined;

    const note = await db.$transaction(async (tx) => {
      const created = await tx.caseNote.create({
        data: {
          clientId: client.id,
          authorId: user.id,
          contactType: data.contactType,
          category: data.category,
          note: data.note,
          outcome: data.outcome,
          followUpAction: data.followUpAction,
          followUpDate: data.followUpDate ? new Date(data.followUpDate) : undefined,
          occurredAt,
          method: data.method ?? 'OTHER',
          direction: data.direction,
          durationMinutes: data.durationMinutes,
          completed,
          attempted: data.attempted ?? false,
          meaningful,
          nextContactDueAt: nextDueAt,
          restricted: data.restricted,
          finalised: true
        }
      });
      await tx.caseNoteVersion.create({ data: { caseNoteId: created.id, authorId: user.id, content: data.note, reason: 'Initial finalised note' } });
      return created;
    });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'CASE_NOTE_CREATED', resourceType: 'CaseNote', resourceId: note.id, after: { clientId: client.id, category: note.category, method: note.method, countedAsSupport, nextContactDueAt: note.nextContactDueAt, restricted: note.restricted } });
    return NextResponse.json({ id: note.id, countedAsSupport, nextContactDueAt: note.nextContactDueAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to save the case note.' : message }, { status });
  }
}
