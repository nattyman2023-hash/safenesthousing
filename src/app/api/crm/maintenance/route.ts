import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { maintenanceTicketCreateSchema } from '@/lib/crm-validation';
import { buildMaintenanceReference, effectiveMaintenancePriority, maintenanceTargetFixAt } from '@/lib/operations-domain';
import { apiErrorResponse, assertReferences, parseDate, requireCrmApiUser, validationError } from '@/lib/crm-api';

/** Raises a repair ticket. Priority and target date are derived by the operations domain, so a
 * safety-critical category escalates the SLA even if the reporter picks a lower priority. */
export async function POST(request: Request) {
  try {
    const user = await requireCrmApiUser();
    const parsed = maintenanceTicketCreateSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues, 'Check the repair details.');
    const data = parsed.data;
    await assertReferences(user, { clientId: data.clientId, propertyId: data.propertyId, roomId: data.roomId, assignedToId: data.assignedToId });

    const reportedAt = new Date();
    const sequence = (await db.maintenanceTicket.count({ where: { organisationId: user.organisationId } })) + 1;
    const reference = buildMaintenanceReference(sequence, reportedAt);
    const priority = effectiveMaintenancePriority(data.priority, data.category, data.safetyRisk);
    const targetFixAt = parseDate(data.targetFixAt, 'target fix date') ?? maintenanceTargetFixAt(reportedAt, priority, data.category, data.safetyRisk);

    const ticket = await db.maintenanceTicket.create({
      data: {
        organisationId: user.organisationId,
        reference,
        clientId: data.clientId,
        propertyId: data.propertyId,
        roomId: data.roomId,
        title: data.title,
        description: data.description,
        category: data.category,
        trade: data.trade,
        priority,
        status: 'REPORTED',
        safetyRisk: data.safetyRisk,
        reportedById: user.id,
        assignedToId: data.assignedToId,
        contractor: data.contractor,
        reportedAt,
        targetFixAt,
        costMinor: data.costMinor
      }
    });
    await db.maintenanceUpdate.create({ data: { ticketId: ticket.id, status: 'REPORTED', note: 'Repair reported.', authorId: user.id } });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'MAINTENANCE_TICKET_RAISED', resourceType: 'MaintenanceTicket', resourceId: ticket.id, after: { reference: ticket.reference, category: ticket.category, priority: ticket.priority, safetyRisk: ticket.safetyRisk, propertyId: ticket.propertyId } });
    return NextResponse.json({ id: ticket.id, reference: ticket.reference, priority: ticket.priority });
  } catch (error) {
    return apiErrorResponse(error, 'Unable to raise the repair ticket.');
  }
}
