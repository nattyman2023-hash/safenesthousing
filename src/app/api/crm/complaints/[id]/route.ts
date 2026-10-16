import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { complaintUpdateSchema } from '@/lib/crm-validation';
import { assertComplaintTransition, complaintTimescales, isComplaintOpen, requiresLearningRecord } from '@/lib/complaints-domain';
import { apiErrorResponse, assertReferences, parseDate, requireCrmApiUser, validationError } from '@/lib/crm-api';

/** Progresses a complaint. Moving to a new stage resets the response deadline from that stage's
 * working-day window, and a upheld outcome is nudged to capture learning before it is closed. */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const user = await requireCrmApiUser();
    const parsed = complaintUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues, 'Check the complaint update.');
    const complaint = await db.complaint.findFirst({ where: { id: params.id, organisationId: user.organisationId } });
    if (!complaint) return NextResponse.json({ error: 'Complaint not found.' }, { status: 404 });

    const data = parsed.data;
    if (data.status !== complaint.status) assertComplaintTransition(complaint.status, data.status);
    await assertReferences(user, { ownerId: data.ownerId });
    const outcome = data.outcome ?? complaint.outcome;
    const stageChanged = data.stage !== complaint.stage;
    const dueAt = parseDate(data.dueAt, 'response deadline') ?? (stageChanged ? complaintTimescales(complaint.receivedAt, data.stage).responseDueAt : undefined);
    const closedAt = isComplaintOpen(data.status) ? null : complaint.closedAt ?? new Date();

    // The learning requirement belongs to the complaint being closed, not to the closed state:
    // `requiresLearningRecord` answers false for any status that is already closed, so it has to be
    // asked about the status the complaint has now. Asking it about the incoming status made this
    // guard unreachable, and an upheld complaint could be closed with nothing learned from it —
    // even though the form labels the field "Learning (required to close)".
    if (closedAt && requiresLearningRecord({ status: complaint.status, outcome }) && !(data.learning ?? complaint.learning)) {
      return NextResponse.json({ error: 'Record what the organisation has learned before closing a complaint with this outcome.' }, { status: 400 });
    }

    const updated = await db.complaint.update({
      where: { id: complaint.id },
      data: {
        status: data.status,
        stage: data.stage,
        severity: data.severity,
        outcome,
        learning: data.learning ?? complaint.learning,
        ownerId: data.ownerId ?? complaint.ownerId,
        acknowledgedAt: data.status === 'ACKNOWLEDGED' ? complaint.acknowledgedAt ?? new Date() : complaint.acknowledgedAt,
        dueAt,
        closedAt
      }
    });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'COMPLAINT_UPDATED', resourceType: 'Complaint', resourceId: complaint.id, before: { status: complaint.status, stage: complaint.stage }, after: { status: updated.status, stage: updated.stage, outcome: updated.outcome } });
    return NextResponse.json({ ok: true, status: updated.status, dueAt: updated.dueAt, closedAt: updated.closedAt });
  } catch (error) {
    return apiErrorResponse(error, 'Unable to update the complaint.');
  }
}
