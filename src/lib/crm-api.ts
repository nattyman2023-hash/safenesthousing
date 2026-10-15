import { NextResponse } from 'next/server';
import { db } from './db';
import { requireUser } from './auth';

/**
 * Shared plumbing for the CRM route handlers.
 *
 * The domain modules own the rules: status changes go through their transition
 * guards, and the helpers here only translate the outcome into an HTTP response.
 * Keeping that translation in one place means every operations endpoint answers
 * the same way for a stale page, a missing record, or a reference from another
 * organisation.
 */

type CrmApiUser = Awaited<ReturnType<typeof requireUser>>;

/** A request problem the caller can fix. */
export class CrmApiError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'CrmApiError';
    this.status = status;
  }
}

export type FieldErrors = Array<{ message: string }>;

export function validationError(issues: FieldErrors | undefined, fallback: string) {
  return NextResponse.json({ error: issues?.[0]?.message ?? fallback }, { status: 400 });
}

/** Domain guards throw `Invalid <record> transition: FROM -> TO`. A stale status is a conflict, not
 * a server fault, so it answers 409 with plain language rather than leaking the internal code. */
export function apiErrorResponse(error: unknown, fallback: string) {
  if (error instanceof CrmApiError) return NextResponse.json({ error: error.message }, { status: error.status });
  const message = error instanceof Error ? error.message : '';
  if (message === 'AUTH_REQUIRED') return NextResponse.json({ error: message }, { status: 401 });
  if (message.startsWith('Invalid ')) return NextResponse.json({ error: 'That status change is not allowed from the current state. Refresh and try again.' }, { status: 409 });
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/** Datetime-local inputs arrive as local wall-clock strings, which `new Date` reads as the browser
 * timezone — the same convention the rota and task routes already use. */
export function parseDate(value: string | undefined | null, label: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new CrmApiError(`Enter a valid ${label}.`);
  return date;
}

export function parseRequiredDate(value: string, label: string): Date {
  const date = parseDate(value, label);
  if (!date) throw new CrmApiError(`Enter a valid ${label}.`);
  return date;
}

/** Case: `MNT-2607-018`. Mirrors the incident and client reference format. */
export function makeRecordReference(prefix: string, at = new Date()): string {
  const yy = String(at.getFullYear()).slice(2);
  const mm = String(at.getMonth() + 1).padStart(2, '0');
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${yy}${mm}-${suffix}`;
}

export async function requireCrmApiUser(): Promise<CrmApiUser> {
  return requireUser();
}

/** The signed-in user's organisation is the boundary for every reference a form can send. */
export async function getScopedClient(user: CrmApiUser, clientId: string) {
  const client = await db.client.findFirst({ where: { id: clientId, organisationId: user.organisationId } });
  if (!client) throw new CrmApiError('Choose a service user from your organisation.');
  return client;
}

export async function assertClientRef(user: CrmApiUser, clientId?: string | null) {
  if (clientId) await getScopedClient(user, clientId);
}

export async function assertPropertyRef(user: CrmApiUser, propertyId?: string | null) {
  if (!propertyId) return;
  const property = await db.property.findFirst({ where: { id: propertyId, organisationId: user.organisationId } });
  if (!property) throw new CrmApiError('Choose a property from your organisation.');
}

export async function assertStaffRef(user: CrmApiUser, userId?: string | null, label = 'staff member') {
  if (!userId) return;
  const staff = await db.user.findFirst({ where: { id: userId, organisationId: user.organisationId } });
  if (!staff) throw new CrmApiError(`Choose a ${label} from your organisation.`);
}

export async function assertRoomRef(user: CrmApiUser, propertyId: string | undefined | null, roomId?: string | null) {
  if (!roomId) return;
  if (!propertyId) throw new CrmApiError('Choose a property before choosing a room.');
  const room = await db.room.findFirst({ where: { id: roomId, propertyId } });
  if (!room) throw new CrmApiError('Choose a room that belongs to that property.');
}

export async function assertTicketRef(user: CrmApiUser, ticketId?: string | null) {
  if (!ticketId) return;
  const ticket = await db.maintenanceTicket.findFirst({ where: { id: ticketId, organisationId: user.organisationId } });
  if (!ticket) throw new CrmApiError('Choose a repair ticket from your organisation.');
}

export async function assertReferences(
  user: CrmApiUser,
  refs: { clientId?: string | null; propertyId?: string | null; ownerId?: string | null; assignedToId?: string | null; checkedById?: string | null; ticketId?: string | null; roomId?: string | null }
) {
  await assertClientRef(user, refs.clientId);
  await assertPropertyRef(user, refs.propertyId);
  await assertStaffRef(user, refs.ownerId, 'staff member');
  await assertStaffRef(user, refs.assignedToId, 'staff member');
  await assertStaffRef(user, refs.checkedById, 'staff member');
  await assertTicketRef(user, refs.ticketId);
  await assertRoomRef(user, refs.propertyId, refs.roomId);
}
