import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { appointmentUpdateSchema } from '@/lib/crm-validation';
import { assertAppointmentTransition } from '@/lib/appointments';
import { apiErrorResponse, parseDate, requireCrmApiUser, validationError } from '@/lib/crm-api';

/** Status changes and outcomes for a booked appointment. The domain guard owns which moves are
 * allowed, so an out-of-date page gets a conflict rather than a silently wrong status. */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const user = await requireCrmApiUser();
    const parsed = appointmentUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues, 'Check the appointment update.');
    const appointment = await db.appointment.findFirst({ where: { id: params.id, organisationId: user.organisationId } });
    if (!appointment) return NextResponse.json({ error: 'Appointment not found.' }, { status: 404 });

    const data = parsed.data;
    if (data.status !== appointment.status) assertAppointmentTransition(appointment.status, data.status);
    const startsAt = parseDate(data.startsAt, 'appointment start');
    const completedAt = data.status === 'COMPLETED' ? appointment.completedAt ?? new Date() : appointment.completedAt;

    const updated = await db.appointment.update({
      where: { id: appointment.id },
      data: {
        status: data.status,
        outcome: data.outcome ?? appointment.outcome,
        notes: data.notes ?? appointment.notes,
        location: data.location ?? appointment.location,
        startsAt,
        completedAt
      }
    });
    await audit({
      organisationId: user.organisationId,
      actorId: user.id,
      action: data.outcome ? 'APPOINTMENT_OUTCOME_RECORDED' : 'APPOINTMENT_STATUS_CHANGED',
      resourceType: 'Appointment',
      resourceId: appointment.id,
      before: { status: appointment.status },
      after: { status: updated.status, hasOutcome: Boolean(updated.outcome) }
    });
    return NextResponse.json({ ok: true, status: updated.status });
  } catch (error) {
    return apiErrorResponse(error, 'Unable to update the appointment.');
  }
}
