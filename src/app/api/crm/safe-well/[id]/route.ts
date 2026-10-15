import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { safeWellCheckUpdateSchema } from '@/lib/crm-validation';
import { assertSafeWellTransition, nextSafeWellDueAt } from '@/lib/safe-well';
import { apiErrorResponse, requireCrmApiUser, validationError } from '@/lib/crm-api';

/** Completes or closes out a Safe & Well check. Completing it rolls the next due date forward from
 * the client's frequency; raising a concern requires the summary that gets triaged. */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const user = await requireCrmApiUser();
    const parsed = safeWellCheckUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues, 'Check the Safe & Well update.');
    const check = await db.safeWellCheck.findFirst({ where: { id: params.id, client: { organisationId: user.organisationId } }, include: { client: true } });
    if (!check) return NextResponse.json({ error: 'Safe & Well check not found.' }, { status: 404 });

    const data = parsed.data;
    if (data.status !== check.status) assertSafeWellTransition(check.status, data.status);
    const concernRaised = data.concernRaised ?? check.concernRaised;
    if (concernRaised && !(data.concernSummary ?? check.concernSummary)) {
      return NextResponse.json({ error: 'Record what the concern is before flagging it.' }, { status: 400 });
    }
    const completing = data.status === 'COMPLETED' || data.status === 'CONCERN_RAISED';
    const completedAt = completing ? check.completedAt ?? new Date() : check.completedAt;

    const updated = await db.safeWellCheck.update({
      where: { id: check.id },
      data: {
        status: data.status,
        method: data.method ?? check.method,
        concernRaised,
        concernSummary: data.concernSummary ?? check.concernSummary,
        actionsTaken: data.actionsTaken ?? check.actionsTaken,
        completedAt,
        nextDueAt: completing ? nextSafeWellDueAt(completedAt, check.client.safeWellFrequencyDays) : check.nextDueAt
      }
    });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: concernRaised ? 'SAFE_WELL_CONCERN_RAISED' : 'SAFE_WELL_CHECK_UPDATED', resourceType: 'SafeWellCheck', resourceId: check.id, before: { status: check.status }, after: { status: updated.status, concernRaised: updated.concernRaised, nextDueAt: updated.nextDueAt } });
    return NextResponse.json({ ok: true, status: updated.status, nextDueAt: updated.nextDueAt, concernRaised: updated.concernRaised });
  } catch (error) {
    return apiErrorResponse(error, 'Unable to update the Safe & Well check.');
  }
}
