import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { penPortraitSchema } from '@/lib/crm-validation';
import { nextPenPortraitReviewDue, penPortraitCompleteness, penPortraitStatus } from '@/lib/pen-portrait';
import { apiErrorResponse, getScopedClient, requireCrmApiUser, validationError } from '@/lib/crm-api';

/** Saves the "about me" portrait. Status is never set by hand: the pen-portrait domain decides
 * whether the sections actually hold enough detail to call it in progress or complete. */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const user = await requireCrmApiUser();
    const parsed = penPortraitSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues, 'Check the pen portrait.');
    const client = await getScopedClient(user, params.id);

    const existing = await db.penPortrait.findUnique({ where: { clientId: client.id } });
    const merged = { ...(existing ?? {}), ...parsed.data };
    const status = penPortraitStatus(merged);
    const completedAt = status === 'COMPLETE' ? existing?.completedAt ?? new Date() : null;
    const reviewDueAt = completedAt ? nextPenPortraitReviewDue(completedAt) : existing?.reviewDueAt ?? null;

    const portrait = await db.penPortrait.upsert({
      where: { clientId: client.id },
      create: { clientId: client.id, ...parsed.data, status, completedAt, reviewDueAt, updatedBy: user.id },
      update: { ...parsed.data, status, completedAt, reviewDueAt, updatedBy: user.id }
    });
    const completeness = penPortraitCompleteness(portrait);
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'PEN_PORTRAIT_UPDATED', resourceType: 'PenPortrait', resourceId: portrait.id, before: existing ? { status: existing.status } : undefined, after: { clientId: client.id, status: portrait.status, percent: completeness.percent } });
    return NextResponse.json({ ok: true, status: portrait.status, percent: completeness.percent, missing: completeness.missing });
  } catch (error) {
    return apiErrorResponse(error, 'Unable to save the pen portrait.');
  }
}
