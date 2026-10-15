import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { moveChecklistItemUpdateSchema } from '@/lib/crm-validation';
import { assertChecklistItemTransition, canCompleteChecklist, canTransitionChecklist, checklistBlocking, checklistStatusFromItems } from '@/lib/move-checklist';
import { apiErrorResponse, requireCrmApiUser, validationError } from '@/lib/crm-api';

/** Updates one row of a move checklist and re-derives the checklist's own status. Required items
 * that are still outstanding keep the checklist in progress, so it cannot be quietly closed. */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const user = await requireCrmApiUser();
    const parsed = moveChecklistItemUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues, 'Check the checklist item update.');
    const item = await db.moveChecklistItem.findFirst({
      where: { id: params.id, checklist: { client: { organisationId: user.organisationId } } },
      include: { checklist: { include: { items: true } } }
    });
    if (!item) return NextResponse.json({ error: 'Checklist item not found.' }, { status: 404 });

    const data = parsed.data;
    if (data.status !== item.status) assertChecklistItemTransition(item.status, data.status);

    const updatedItem = await db.moveChecklistItem.update({
      where: { id: item.id },
      data: { status: data.status, notes: data.notes ?? item.notes, completedAt: data.status === 'DONE' ? item.completedAt ?? new Date() : null }
    });

    const mergedItems = item.checklist.items.map((row) => (row.id === item.id ? { ...row, status: data.status } : row));
    const derived = checklistStatusFromItems(mergedItems, item.checklist.checklistType);
    const canComplete = canCompleteChecklist(mergedItems, item.checklist.checklistType);
    const nextStatus = derived === 'COMPLETED' && !canComplete ? item.checklist.status : derived;
    const checklistChanged = nextStatus !== item.checklist.status && canTransitionChecklist(item.checklist.status, nextStatus);
    const checklist = checklistChanged
      ? await db.moveChecklist.update({ where: { id: item.checklist.id }, data: { status: nextStatus, completedAt: nextStatus === 'COMPLETED' ? item.checklist.completedAt ?? new Date() : null } })
      : item.checklist;

    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'MOVE_CHECKLIST_ITEM_UPDATED', resourceType: 'MoveChecklistItem', resourceId: item.id, before: { status: item.status, checklistStatus: item.checklist.status }, after: { status: updatedItem.status, checklistStatus: checklist.status } });
    return NextResponse.json({ ok: true, status: updatedItem.status, checklistStatus: checklist.status, blocking: checklistBlocking(mergedItems, item.checklist.checklistType) });
  } catch (error) {
    return apiErrorResponse(error, 'Unable to update the checklist item.');
  }
}
