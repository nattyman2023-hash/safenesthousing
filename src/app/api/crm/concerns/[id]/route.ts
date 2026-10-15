import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { concernUpdateSchema } from '@/lib/crm-validation';
import { assertConcernTransition, isConcernOpen } from '@/lib/concerns-domain';
import { apiErrorResponse, assertReferences, parseDate, requireCrmApiUser, validationError } from '@/lib/crm-api';

/** Progresses a concern. An optional action note is appended as a separate row so the concern's
 * history stays readable, and resolving it stamps the resolution time used by the ageing report. */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const user = await requireCrmApiUser();
    const parsed = concernUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues, 'Check the concern update.');
    const concern = await db.concern.findFirst({ where: { id: params.id, organisationId: user.organisationId } });
    if (!concern) return NextResponse.json({ error: 'Concern not found.' }, { status: 404 });

    const data = parsed.data;
    if (data.status !== concern.status) assertConcernTransition(concern.status, data.status);
    await assertReferences(user, { ownerId: data.ownerId });
    const dueAt = parseDate(data.dueAt, 'response deadline');
    const closed = !isConcernOpen(data.status);

    const updated = await db.concern.update({
      where: { id: concern.id },
      data: {
        status: data.status,
        resolution: data.resolution ?? concern.resolution,
        referralNeeded: data.referralNeeded ?? concern.referralNeeded,
        ownerId: data.ownerId ?? concern.ownerId,
        dueAt,
        resolvedAt: closed ? concern.resolvedAt ?? new Date() : null
      }
    });
    if (data.action) await db.concernAction.create({ data: { concernId: concern.id, note: data.action, authorId: user.id } });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: closed ? 'CONCERN_RESOLVED' : 'CONCERN_UPDATED', resourceType: 'Concern', resourceId: concern.id, before: { status: concern.status }, after: { status: updated.status, referralNeeded: updated.referralNeeded } });
    return NextResponse.json({ ok: true, status: updated.status });
  } catch (error) {
    return apiErrorResponse(error, 'Unable to update the concern.');
  }
}
