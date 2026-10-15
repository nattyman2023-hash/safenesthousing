import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { moveChecklistCreateSchema } from '@/lib/crm-validation';
import { buildChecklistItems, checklistStatusFromItems, requiredItemLabels } from '@/lib/move-checklist';
import { apiErrorResponse, assertPropertyRef, getScopedClient, parseDate, requireCrmApiUser, validationError } from '@/lib/crm-api';

/** Starts a move-in or move-out checklist. The template comes from the domain module, so every
 * service user is asked for the same evidence before a tenancy starts or ends. */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const user = await requireCrmApiUser();
    const parsed = moveChecklistCreateSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues, 'Check the checklist details.');
    const client = await getScopedClient(user, params.id);
    const data = parsed.data;
    await assertPropertyRef(user, data.propertyId);

    const targetDate = parseDate(data.targetDate, 'target date') ?? null;
    const generated = buildChecklistItems(data.checklistType, targetDate);
    const checklist = await db.moveChecklist.create({
      data: {
        clientId: client.id,
        checklistType: data.checklistType,
        status: checklistStatusFromItems(generated.map((item) => ({ label: item.label, status: item.status, category: item.category })), data.checklistType),
        targetDate,
        propertyId: data.propertyId,
        createdBy: user.id,
        notes: data.notes,
        items: { create: generated.map((item) => ({ label: item.label, category: item.category, status: item.status, dueAt: item.dueAt, sortOrder: item.sortOrder })) }
      },
      include: { items: true }
    });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'MOVE_CHECKLIST_CREATED', resourceType: 'MoveChecklist', resourceId: checklist.id, after: { clientId: client.id, checklistType: checklist.checklistType, itemCount: checklist.items.length, targetDate: checklist.targetDate, requiredItems: requiredItemLabels(checklist.checklistType).length } });
    return NextResponse.json({ id: checklist.id, status: checklist.status, items: checklist.items.length });
  } catch (error) {
    return apiErrorResponse(error, 'Unable to start the checklist.');
  }
}
