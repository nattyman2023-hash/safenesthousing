import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { policyResourceUpdateSchema } from '@/lib/crm-validation';
import { assertPolicyTransition } from '@/lib/compliance-domain';
import { apiErrorResponse, parseDate, requireCrmApiUser, validationError } from '@/lib/crm-api';

/** Publishes, reviews, or archives a policy. Superseding or archiving does not delete anything —
 * the library keeps the version history staff were held to at the time. */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const user = await requireCrmApiUser();
    const parsed = policyResourceUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues, 'Check the policy update.');
    const policy = await db.policyResource.findFirst({ where: { id: params.id, organisationId: user.organisationId } });
    if (!policy) return NextResponse.json({ error: 'Policy not found.' }, { status: 404 });

    const data = parsed.data;
    if (data.status !== policy.status) assertPolicyTransition(policy.status, data.status);
    const reviewDueAt = parseDate(data.reviewDueAt, 'review date');

    const updated = await db.policyResource.update({
      where: { id: policy.id },
      data: {
        status: data.status,
        summary: data.summary ?? policy.summary,
        version: data.version ?? policy.version,
        reviewDueAt,
        requiresRead: data.requiresRead ?? policy.requiresRead,
        effectiveFrom: data.status === 'ACTIVE' ? policy.effectiveFrom ?? new Date() : policy.effectiveFrom
      }
    });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'POLICY_RESOURCE_UPDATED', resourceType: 'PolicyResource', resourceId: policy.id, before: { status: policy.status }, after: { status: updated.status, version: updated.version } });
    return NextResponse.json({ ok: true, status: updated.status });
  } catch (error) {
    return apiErrorResponse(error, 'Unable to update the policy.');
  }
}
