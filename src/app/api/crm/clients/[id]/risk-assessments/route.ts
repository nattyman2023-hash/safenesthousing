import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { riskAssessmentCreateSchema } from '@/lib/crm-validation';
import { overallRiskLevel, requiresSafeguardingReferral, riskReviewDueAt, safeguardingTriggerReasons, type RiskFactorRecord } from '@/lib/risk-domain';
import { apiErrorResponse, getScopedClient, parseDate, requireCrmApiUser, validationError } from '@/lib/crm-api';

/** Records a risk assessment. Making one active supersedes whichever assessment was active before,
 * so there is always exactly one live view of risk without destroying the earlier version. */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const user = await requireCrmApiUser();
    const parsed = riskAssessmentCreateSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues, 'Check the risk assessment.');
    const client = await getScopedClient(user, params.id);

    const data = parsed.data;
    const assessedAt = new Date();
    const reviewDueAt = parseDate(data.reviewDueAt, 'review date') ?? riskReviewDueAt(assessedAt, data.level);
    const previousActive = data.status === 'ACTIVE'
      ? await db.riskAssessment.findFirst({ where: { clientId: client.id, status: 'ACTIVE' }, orderBy: { assessedAt: 'desc' } })
      : null;

    const assessment = await db.riskAssessment.create({
      data: {
        clientId: client.id,
        assessmentType: data.assessmentType,
        level: data.level,
        status: data.status,
        assessedAt,
        reviewDueAt,
        assessedBy: user.id,
        summary: data.summary,
        controlMeasures: data.controlMeasures,
        triggerReason: data.triggerReason,
        supersedesId: previousActive?.id
      }
    });
    if (previousActive) {
      await db.riskAssessment.update({ where: { id: previousActive.id }, data: { status: 'SUPERSEDED' } });
      await audit({ organisationId: user.organisationId, actorId: user.id, action: 'RISK_ASSESSMENT_SUPERSEDED', resourceType: 'RiskAssessment', resourceId: previousActive.id, before: { status: 'ACTIVE' }, after: { status: 'SUPERSEDED', supersededById: assessment.id } });
    }

    const liveFactors = await db.riskFactor.findMany({ where: { riskAssessment: { clientId: client.id, status: { notIn: ['SUPERSEDED', 'CLOSED'] } } }, select: { category: true, score: true, status: true } });
    const factorRecords: RiskFactorRecord[] = liveFactors;
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'RISK_ASSESSMENT_CREATED', resourceType: 'RiskAssessment', resourceId: assessment.id, after: { clientId: client.id, assessmentType: assessment.assessmentType, level: assessment.level, status: assessment.status, reviewDueAt: assessment.reviewDueAt } });
    return NextResponse.json({
      id: assessment.id,
      status: assessment.status,
      reviewDueAt: assessment.reviewDueAt,
      overallLevel: factorRecords.length ? overallRiskLevel(factorRecords) : data.level,
      safeguardingReferralNeeded: requiresSafeguardingReferral(factorRecords),
      safeguardingReasons: safeguardingTriggerReasons(factorRecords)
    });
  } catch (error) {
    return apiErrorResponse(error, 'Unable to record the risk assessment.');
  }
}
