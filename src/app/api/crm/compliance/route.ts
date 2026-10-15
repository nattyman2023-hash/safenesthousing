import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { complianceRecordSchema } from '@/lib/crm-validation';
import { complianceIntervalMonths, nextComplianceDueAt } from '@/lib/compliance-domain';
import { apiErrorResponse, assertPropertyRef, parseDate, requireCrmApiUser, validationError } from '@/lib/crm-api';

/** Records a compliance obligation for a property. Each property holds one row per obligation
 * type, so this upserts rather than stacking duplicates, and the next due date is derived from the
 * statutory interval unless the record supplies its own certificate expiry. */
export async function POST(request: Request) {
  try {
    const user = await requireCrmApiUser();
    const parsed = complianceRecordSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues, 'Check the compliance record.');
    const data = parsed.data;
    await assertPropertyRef(user, data.propertyId);

    const lastCheckedAt = parseDate(data.lastCheckedAt, 'last checked date');
    const nextDueAt = parseDate(data.nextDueAt, 'next due date')
      ?? (lastCheckedAt ? nextComplianceDueAt(data.complianceType, lastCheckedAt) : undefined);
    const existing = await db.propertyComplianceRecord.findFirst({ where: { propertyId: data.propertyId, complianceType: data.complianceType } });
    const payload = {
      status: data.status,
      lastCheckedAt,
      nextDueAt,
      certificateRef: data.certificateRef,
      contractor: data.contractor,
      outcome: data.outcome,
      notes: data.notes
    };
    const record = existing
      ? await db.propertyComplianceRecord.update({ where: { id: existing.id }, data: payload })
      : await db.propertyComplianceRecord.create({ data: { propertyId: data.propertyId, complianceType: data.complianceType, ...payload } });

    await audit({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'COMPLIANCE_RECORD_SAVED',
      resourceType: 'PropertyComplianceRecord',
      resourceId: record.id,
      before: existing ? { status: existing.status, nextDueAt: existing.nextDueAt } : undefined,
      after: { propertyId: record.propertyId, complianceType: record.complianceType, status: record.status, nextDueAt: record.nextDueAt, intervalMonths: complianceIntervalMonths(record.complianceType) }
    });
    return NextResponse.json({ id: record.id, status: record.status, nextDueAt: record.nextDueAt, created: !existing });
  } catch (error) {
    return apiErrorResponse(error, 'Unable to save the compliance record.');
  }
}
