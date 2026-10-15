import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { concernCreateSchema } from '@/lib/crm-validation';
import { concernResponseDueAt, shouldReferConcern } from '@/lib/concerns-domain';
import { apiErrorResponse, assertReferences, makeRecordReference, parseDate, requireCrmApiUser, validationError } from '@/lib/crm-api';

/** Raises an operational concern. The response deadline comes from the severity, and anything the
 * domain flags as referable is marked for referral at the point of raising rather than later. */
export async function POST(request: Request) {
  try {
    const user = await requireCrmApiUser();
    const parsed = concernCreateSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues, 'Check the concern details.');
    const data = parsed.data;
    await assertReferences(user, { clientId: data.clientId, propertyId: data.propertyId, ownerId: data.ownerId });

    const raisedAt = new Date();
    const dueAt = parseDate(data.dueAt, 'response deadline') ?? concernResponseDueAt(raisedAt, data.severity);
    const referralNeeded = data.referralNeeded || shouldReferConcern({ category: data.category, severity: data.severity });

    const concern = await db.concern.create({
      data: {
        organisationId: user.organisationId,
        reference: makeRecordReference('CN', raisedAt),
        clientId: data.clientId,
        propertyId: data.propertyId,
        title: data.title,
        summary: data.summary,
        category: data.category,
        severity: data.severity,
        status: 'OPEN',
        raisedById: user.id,
        ownerId: data.ownerId ?? user.id,
        raisedAt,
        dueAt,
        referralNeeded
      }
    });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'CONCERN_RAISED', resourceType: 'Concern', resourceId: concern.id, after: { reference: concern.reference, category: concern.category, severity: concern.severity, referralNeeded: concern.referralNeeded } });
    return NextResponse.json({ id: concern.id, reference: concern.reference, referralNeeded: concern.referralNeeded });
  } catch (error) {
    return apiErrorResponse(error, 'Unable to raise the concern.');
  }
}
