import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { complaintCreateSchema } from '@/lib/crm-validation';
import { complaintTimescales } from '@/lib/complaints-domain';
import { apiErrorResponse, assertReferences, makeRecordReference, parseDate, requireCrmApiUser, validationError } from '@/lib/crm-api';

/** Logs a complaint and starts its statutory clock. Acknowledgement and response deadlines are
 * calculated in working days from the stage, so escalation timings stay defensible. */
export async function POST(request: Request) {
  try {
    const user = await requireCrmApiUser();
    const parsed = complaintCreateSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues, 'Check the complaint details.');
    const data = parsed.data;
    await assertReferences(user, { clientId: data.clientId, ownerId: data.ownerId });

    const receivedAt = parseDate(data.receivedAt, 'date the complaint was received') ?? new Date();
    const timescales = complaintTimescales(receivedAt, data.stage);

    const complaint = await db.complaint.create({
      data: {
        organisationId: user.organisationId,
        reference: makeRecordReference('CMP', receivedAt),
        clientId: data.clientId,
        raisedBy: data.raisedBy,
        complainantName: data.complainantName,
        title: data.title,
        summary: data.summary,
        category: data.category,
        severity: data.severity,
        status: 'LOGGED',
        stage: data.stage,
        ownerId: data.ownerId ?? user.id,
        receivedAt,
        dueAt: parseDate(data.dueAt, 'response deadline') ?? timescales.responseDueAt
      }
    });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'COMPLAINT_LOGGED', resourceType: 'Complaint', resourceId: complaint.id, after: { reference: complaint.reference, category: complaint.category, stage: complaint.stage, dueAt: complaint.dueAt } });
    return NextResponse.json({ id: complaint.id, reference: complaint.reference, acknowledgeBy: timescales.acknowledgeBy, responseDueAt: complaint.dueAt });
  } catch (error) {
    return apiErrorResponse(error, 'Unable to log the complaint.');
  }
}
