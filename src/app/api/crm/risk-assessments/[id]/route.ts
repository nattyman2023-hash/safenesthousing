import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { riskAssessmentUpdateSchema } from '@/lib/crm-validation';
import { assertRiskAssessmentTransition, riskReviewDueAt } from '@/lib/risk-domain';
import { apiErrorResponse, parseDate, requireCrmApiUser, validationError } from '@/lib/crm-api';

/** Moves a risk assessment through its lifecycle — activated for use, put up for review, then
 * closed or superseded. Superseded versions stay readable so the decision trail is intact. */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const user = await requireCrmApiUser();
    const parsed = riskAssessmentUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues, 'Check the risk assessment update.');
    const assessment = await db.riskAssessment.findFirst({ where: { id: params.id, client: { organisationId: user.organisationId } } });
    if (!assessment) return NextResponse.json({ error: 'Risk assessment not found.' }, { status: 404 });

    const data = parsed.data;
    if (data.status !== assessment.status) assertRiskAssessmentTransition(assessment.status, data.status);
    const level = data.level ?? assessment.level;
    const reviewDueAt = parseDate(data.reviewDueAt, 'review date') ?? (data.level && data.level !== assessment.level ? riskReviewDueAt(assessment.assessedAt, level) : undefined);

    const updated = await db.riskAssessment.update({
      where: { id: assessment.id },
      data: {
        status: data.status,
        level,
        reviewDueAt,
        summary: data.summary ?? assessment.summary,
        controlMeasures: data.controlMeasures ?? assessment.controlMeasures,
        triggerReason: data.triggerReason ?? assessment.triggerReason
      }
    });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: updated.status === 'CLOSED' ? 'RISK_ASSESSMENT_CLOSED' : 'RISK_ASSESSMENT_UPDATED', resourceType: 'RiskAssessment', resourceId: assessment.id, before: { status: assessment.status, level: assessment.level }, after: { status: updated.status, level: updated.level, reviewDueAt: updated.reviewDueAt } });
    return NextResponse.json({ ok: true, status: updated.status, level: updated.level, reviewDueAt: updated.reviewDueAt });
  } catch (error) {
    return apiErrorResponse(error, 'Unable to update the risk assessment.');
  }
}
