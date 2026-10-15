import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { safeWellCheckCreateSchema } from '@/lib/crm-validation';
import { nextSafeWellDueAt } from '@/lib/safe-well';
import { apiErrorResponse, assertStaffRef, getScopedClient, parseDate, requireCrmApiUser, validationError } from '@/lib/crm-api';

/** Schedules a Safe & Well check. The client's own frequency sets the following due date, so the
 * check cadence stays consistent with the support agreement rather than staff memory. */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const user = await requireCrmApiUser();
    const parsed = safeWellCheckCreateSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues, 'Check the Safe & Well check.');
    const client = await getScopedClient(user, params.id);
    const data = parsed.data;
    await assertStaffRef(user, data.checkedById, 'checking officer');

    const previous = await db.safeWellCheck.findFirst({ where: { clientId: client.id }, orderBy: { createdAt: 'desc' } });
    const scheduledFor = parseDate(data.scheduledFor, 'scheduled date') ?? new Date();
    const nextDueAt = nextSafeWellDueAt(previous?.completedAt, client.safeWellFrequencyDays);

    const check = await db.safeWellCheck.create({
      data: {
        clientId: client.id,
        status: 'SCHEDULED',
        scheduledFor,
        checkedById: data.checkedById ?? user.id,
        method: data.method,
        actionsTaken: data.actionsTaken,
        nextDueAt
      }
    });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'SAFE_WELL_CHECK_SCHEDULED', resourceType: 'SafeWellCheck', resourceId: check.id, after: { clientId: client.id, method: check.method, scheduledFor: check.scheduledFor, frequencyDays: client.safeWellFrequencyDays } });
    return NextResponse.json({ id: check.id, status: check.status, scheduledFor: check.scheduledFor });
  } catch (error) {
    return apiErrorResponse(error, 'Unable to schedule the Safe & Well check.');
  }
}
