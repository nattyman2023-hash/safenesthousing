import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { complianceRecordUpdateSchema } from '@/lib/crm-validation';
import { assertComplianceTransition, nextComplianceDueAt } from '@/lib/compliance-domain';
import { apiErrorResponse, assertPropertyRef, parseDate, requireCrmApiUser, validationError } from '@/lib/crm-api';

/** Updates an existing obligation — typically recording the certificate date that starts the next
 * interval. The status move is checked against the compliance workflow. */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const user = await requireCrmApiUser();
    const parsed = complianceRecordUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues, 'Check the compliance update.');
    const record = await db.propertyComplianceRecord.findFirst({ where: { id: params.id, property: { organisationId: user.organisationId } } });
    if (!record) return NextResponse.json({ error: 'Compliance record not found.' }, { status: 404 });

    const data = parsed.data;
    await assertPropertyRef(user, data.propertyId);
    if (data.status && data.status !== record.status) assertComplianceTransition(record.status, data.status);

    const lastCheckedAt = parseDate(data.lastCheckedAt, 'last checked date');
    const nextDueAt = parseDate(data.nextDueAt, 'next due date')
      ?? (lastCheckedAt ? nextComplianceDueAt(record.complianceType, lastCheckedAt) : undefined);

    const updated = await db.propertyComplianceRecord.update({
      where: { id: record.id },
      data: {
        propertyId: data.propertyId,
        complianceType: data.complianceType ?? record.complianceType,
        status: data.status ?? record.status,
        lastCheckedAt: lastCheckedAt ?? record.lastCheckedAt,
        nextDueAt: nextDueAt ?? record.nextDueAt,
        certificateRef: data.certificateRef ?? record.certificateRef,
        contractor: data.contractor ?? record.contractor,
        outcome: data.outcome ?? record.outcome,
        notes: data.notes ?? record.notes
      }
    });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'COMPLIANCE_RECORD_SAVED', resourceType: 'PropertyComplianceRecord', resourceId: record.id, before: { status: record.status, nextDueAt: record.nextDueAt }, after: { status: updated.status, nextDueAt: updated.nextDueAt } });
    return NextResponse.json({ ok: true, status: updated.status, nextDueAt: updated.nextDueAt });
  } catch (error) {
    return apiErrorResponse(error, 'Unable to update the compliance record.');
  }
}
