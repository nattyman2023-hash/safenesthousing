import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { policyResourceCreateSchema } from '@/lib/crm-validation';
import { nextPolicyReviewDue } from '@/lib/compliance-domain';
import { apiErrorResponse, assertStaffRef, parseDate, requireCrmApiUser, validationError } from '@/lib/crm-api';

/** Adds a policy or procedure to the staff library. A new record defaults to a review a year after
 * it takes effect, which is the cycle the organisation publishes to the regulator. */
export async function POST(request: Request) {
  try {
    const user = await requireCrmApiUser();
    const parsed = policyResourceCreateSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues, 'Check the policy details.');
    const data = parsed.data;
    await assertStaffRef(user, data.ownerId, 'policy owner');

    const effectiveFrom = parseDate(data.effectiveFrom, 'effective date');
    const reviewDueAt = parseDate(data.reviewDueAt, 'review date') ?? nextPolicyReviewDue(effectiveFrom ?? new Date());

    const policy = await db.policyResource.create({
      data: {
        organisationId: user.organisationId,
        title: data.title,
        category: data.category,
        summary: data.summary,
        version: data.version,
        externalUrl: data.externalUrl,
        status: data.status,
        ownerId: data.ownerId ?? user.id,
        effectiveFrom,
        reviewDueAt,
        requiresRead: data.requiresRead
      }
    });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'POLICY_RESOURCE_CREATED', resourceType: 'PolicyResource', resourceId: policy.id, after: { title: policy.title, category: policy.category, status: policy.status, reviewDueAt: policy.reviewDueAt, requiresRead: policy.requiresRead } });
    return NextResponse.json({ id: policy.id, status: policy.status, reviewDueAt: policy.reviewDueAt });
  } catch (error) {
    return apiErrorResponse(error, 'Unable to add the policy.');
  }
}
