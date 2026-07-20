import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { canViewRestricted, requirePermission } from '@/lib/auth';
import { supportGoalSchema, supportReviewSchema } from '@/lib/crm-validation';

function validDate(value: string | undefined) { if (!value) return undefined; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; }

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requirePermission('clients.write');
    const body = await request.json() as { type?: string; supportPlanId?: string } & Record<string, unknown>;
    const client = await db.client.findFirst({ where: { id: params.id, organisationId: user.organisationId } });
    if (!client) return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    if (client.restricted && !canViewRestricted(user)) return NextResponse.json({ error: 'You are not authorised to access this client record.' }, { status: 403 });

    if (body.type === 'goal') {
      const parsed = supportGoalSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the goal details.' }, { status: 400 });
      const targetDate = validDate(parsed.data.targetDate);
      if (parsed.data.targetDate && !targetDate) return NextResponse.json({ error: 'Enter a valid target date.' }, { status: 400 });
      const result = await db.$transaction(async (tx) => {
        const plan = body.supportPlanId ? await tx.supportPlan.findFirst({ where: { id: String(body.supportPlanId), clientId: client.id } }) : await tx.supportPlan.findFirst({ where: { clientId: client.id, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } });
        const activePlan = plan ?? (await tx.supportPlan.create({ data: { clientId: client.id, createdBy: user.id, status: 'ACTIVE', version: 1 } }));
        const goal = await tx.supportGoal.create({ data: { supportPlanId: activePlan.id, category: parsed.data.category, desiredOutcome: parsed.data.desiredOutcome, actionSteps: parsed.data.actionSteps, owner: parsed.data.owner, targetDate: targetDate ?? undefined } });
        return { plan: activePlan, goal };
      });
      await audit({ organisationId: user.organisationId, actorId: user.id, action: 'SUPPORT_GOAL_CREATED', resourceType: 'SupportGoal', resourceId: result.goal.id, after: { clientId: client.id, supportPlanId: result.plan.id, category: result.goal.category } });
      return NextResponse.json({ id: result.goal.id, supportPlanId: result.plan.id });
    }

    if (body.type === 'review') {
      const parsed = supportReviewSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the review details.' }, { status: 400 });
      const reviewDate = validDate(parsed.data.reviewDate);
      if (!reviewDate) return NextResponse.json({ error: 'Enter a valid review date.' }, { status: 400 });
      const plan = await db.supportPlan.findFirst({ where: { id: parsed.data.supportPlanId, clientId: client.id } });
      if (!plan) return NextResponse.json({ error: 'Support plan not found.' }, { status: 404 });
      const review = await db.$transaction(async (tx) => { await tx.supportPlan.update({ where: { id: plan.id }, data: { reviewDate } }); return tx.supportPlanReview.create({ data: { supportPlanId: plan.id, reviewDate, notes: parsed.data.notes, reviewedBy: user.id } }); });
      await audit({ organisationId: user.organisationId, actorId: user.id, action: 'SUPPORT_PLAN_REVIEW_CREATED', resourceType: 'SupportPlanReview', resourceId: review.id, after: { clientId: client.id, supportPlanId: plan.id, reviewDate } });
      return NextResponse.json({ id: review.id });
    }
    return NextResponse.json({ error: 'Choose a support-plan action.' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to save the support-plan change.' : message }, { status });
  }
}
