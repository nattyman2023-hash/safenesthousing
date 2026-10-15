import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { maintenanceTicketUpdateSchema } from '@/lib/crm-validation';
import { assertMaintenanceTransition } from '@/lib/operations-domain';
import { apiErrorResponse, parseDate, requireCrmApiUser, validationError } from '@/lib/crm-api';

/** Moves a repair through its workflow. Every change leaves a progress note on the ticket because
 * housing providers are asked to evidence the repair journey, not just the final outcome. */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const user = await requireCrmApiUser();
    const parsed = maintenanceTicketUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues, 'Check the repair update.');
    const ticket = await db.maintenanceTicket.findFirst({ where: { id: params.id, organisationId: user.organisationId } });
    if (!ticket) return NextResponse.json({ error: 'Repair ticket not found.' }, { status: 404 });

    const data = parsed.data;
    if (data.status !== ticket.status) assertMaintenanceTransition(ticket.status, data.status);
    const targetFixAt = parseDate(data.targetFixAt, 'target fix date');

    const updated = await db.maintenanceTicket.update({
      where: { id: ticket.id },
      data: {
        status: data.status,
        contractor: data.contractor ?? ticket.contractor,
        targetFixAt,
        costMinor: data.costMinor ?? ticket.costMinor,
        completedAt: data.status === 'COMPLETED' ? ticket.completedAt ?? new Date() : null
      }
    });
    await db.maintenanceUpdate.create({ data: { ticketId: ticket.id, status: data.status, note: data.note, authorId: user.id } });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: data.status === 'COMPLETED' ? 'MAINTENANCE_TICKET_COMPLETED' : 'MAINTENANCE_TICKET_UPDATED', resourceType: 'MaintenanceTicket', resourceId: ticket.id, before: { status: ticket.status }, after: { status: updated.status } });
    return NextResponse.json({ ok: true, status: updated.status });
  } catch (error) {
    return apiErrorResponse(error, 'Unable to update the repair ticket.');
  }
}
