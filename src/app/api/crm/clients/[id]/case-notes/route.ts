import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { caseNoteSchema } from '@/lib/crm-validation';
import { contactCountsAsSupport, isContactLogNote, nextContactDueAt } from '@/lib/contact-tracking';

/** Records a finalised case note. The same row is the contact log: recording a contact also sets
 * when the next planned contact falls due for that person.
 *
 * Whether this note is a contact at all is decided by `isContactLogNote` — the same rule every
 * planned-contact measure reads with — before anything is written. A structured case note (a
 * review, a housing update, a safeguarding record) is therefore stored without a next-due date and
 * reported as a case note, instead of quietly becoming a planned contact that never happened. */
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
    const attempted = data.attempted ?? false;
    const method = data.method ?? 'OTHER';
    // A note only joins the planned-contact record when it was logged as a contact: a way of keeping
    // in touch, an explicit "did not go ahead", or a failed attempt. Anything else is case-work
    // narrative, and counting it would move the next-due date without a contact ever happening.
    const contactLog = isContactLogNote({ method, attempted, completed, nextContactDueAt: null });
    const countedAsSupport = contactLog && contactCountsAsSupport({ completed, meaningful, attempted });
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
          method,
          direction: data.direction,
          durationMinutes: data.durationMinutes,
          completed,
          attempted,
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
