import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { appointmentCreateSchema } from '@/lib/crm-validation';
import { defaultAppointmentEnd, findAppointmentClashes, type CalendarAppointment } from '@/lib/appointments';
import { startOfDay, endOfDay } from '@/lib/dates';
import { apiErrorResponse, assertReferences, parseDate, parseRequiredDate, requireCrmApiUser, validationError } from '@/lib/crm-api';

function clashMessage(clash: { first: { title: string }; reason: 'OWNER' | 'SERVICE_USER' | 'PROPERTY' }) {
  if (clash.reason === 'OWNER') return `That staff member is already booked at this time (${clash.first.title}).`;
  if (clash.reason === 'SERVICE_USER') return `That service user already has an appointment at this time (${clash.first.title}).`;
  return `That property already has a visit booked at this time (${clash.first.title}).`;
}

export async function POST(request: Request) {
  try {
    const user = await requireCrmApiUser();
    const parsed = appointmentCreateSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues, 'Check the appointment details.');
    const data = parsed.data;
    await assertReferences(user, { clientId: data.clientId, propertyId: data.propertyId, ticketId: data.ticketId, ownerId: data.ownerId });

    const startsAt = parseRequiredDate(data.startsAt, 'appointment start');
    const endsAt = parseDate(data.endsAt, 'appointment end') ?? defaultAppointmentEnd(startsAt);
    if (endsAt.getTime() <= startsAt.getTime()) return NextResponse.json({ error: 'The appointment must end after it starts.' }, { status: 400 });

    const existing = await db.appointment.findMany({
      where: { organisationId: user.organisationId, startsAt: { gte: startOfDay(startsAt), lte: endOfDay(startsAt) } },
      select: { id: true, title: true, startsAt: true, endsAt: true, status: true, category: true, ownerId: true, clientId: true, propertyId: true }
    });
    const pending: CalendarAppointment = { id: 'pending', title: data.title, startsAt, endsAt, status: 'SCHEDULED', category: data.category, ownerId: data.ownerId ?? null, clientId: data.clientId ?? null, propertyId: data.propertyId ?? null };
    const clash = findAppointmentClashes([...(existing as CalendarAppointment[]), pending])[0];
    if (clash) return NextResponse.json({ error: clashMessage(clash) }, { status: 409 });

    const appointment = await db.appointment.create({
      data: {
        organisationId: user.organisationId,
        clientId: data.clientId,
        propertyId: data.propertyId,
        ticketId: data.ticketId,
        title: data.title,
        category: data.category,
        location: data.location,
        startsAt,
        endsAt,
        allDay: data.allDay,
        status: 'SCHEDULED',
        ownerId: data.ownerId ?? user.id,
        attendees: data.attendees,
        notes: data.notes
      }
    });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'APPOINTMENT_CREATED', resourceType: 'Appointment', resourceId: appointment.id, after: { title: appointment.title, category: appointment.category, startsAt: appointment.startsAt, clientId: appointment.clientId } });
    return NextResponse.json({ id: appointment.id, status: appointment.status });
  } catch (error) {
    return apiErrorResponse(error, 'Unable to book the appointment.');
  }
}
