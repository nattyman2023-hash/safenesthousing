'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { APPOINTMENT_CATEGORIES } from '@/lib/appointments';
import { useHydrated } from '@/lib/use-hydrated';

type Option = { id: string; label: string };

function isoOrUndefined(value: FormDataEntryValue | null) {
  const text = String(value ?? '').trim();
  return text ? new Date(text).toISOString() : undefined;
}

export function AppointmentCreateForm({ clients, properties, staff }: { clients: Option[]; properties: Option[]; staff: Option[] }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState('sending'); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      title: form.get('title'),
      category: form.get('category'),
      startsAt: isoOrUndefined(form.get('startsAt')),
      endsAt: isoOrUndefined(form.get('endsAt')),
      allDay: form.get('allDay') === 'on',
      location: form.get('location') || undefined,
      clientId: form.get('clientId') || undefined,
      propertyId: form.get('propertyId') || undefined,
      ownerId: form.get('ownerId') || undefined,
      attendees: form.get('attendees') || undefined,
      notes: form.get('notes') || undefined
    };
    const response = await fetch('/api/crm/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (response.ok) { setState('success'); setMessage('Appointment booked.'); formElement.reset(); router.refresh(); } else { setState('error'); setMessage(result.error ?? 'We could not book the appointment.'); }
  }
  return <form id="new" className="form-card" onSubmit={submit} method="post"><h2>Book appointment</h2>{message && <div className={state === 'success' ? 'form-success' : 'form-error'} role="status">{message}</div>}<div className="form-grid">
    <div className="form-field full"><label htmlFor="appt-title">Title</label><input id="appt-title" name="title" placeholder="Key work session" required /></div>
    <div className="form-field"><label htmlFor="appt-category">Category</label><select id="appt-category" name="category" defaultValue="SUPPORT">{APPOINTMENT_CATEGORIES.map((category) => <option key={category} value={category}>{category.replace(/_/g, ' ').toLowerCase()}</option>)}</select></div>
    <div className="form-field"><label htmlFor="appt-owner">Owner</label><select id="appt-owner" name="ownerId" defaultValue=""><option value="">Unassigned</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}</select></div>
    <div className="form-field"><label htmlFor="appt-start">Starts</label><input id="appt-start" name="startsAt" type="datetime-local" required /></div>
    <div className="form-field"><label htmlFor="appt-end">Ends</label><input id="appt-end" name="endsAt" type="datetime-local" /></div>
    <div className="form-field"><label htmlFor="appt-client">Person</label><select id="appt-client" name="clientId" defaultValue=""><option value="">Not linked to a client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.label}</option>)}</select></div>
    <div className="form-field"><label htmlFor="appt-property">Property</label><select id="appt-property" name="propertyId" defaultValue=""><option value="">No property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.label}</option>)}</select></div>
    <div className="form-field"><label htmlFor="appt-location">Location</label><input id="appt-location" name="location" placeholder="Office, home visit, or address" /></div>
    <div className="form-field"><label htmlFor="appt-attendees">Attendees</label><input id="appt-attendees" name="attendees" placeholder="Names or roles" /></div>
    <div className="form-field full"><label htmlFor="appt-notes">Notes</label><textarea id="appt-notes" name="notes" /></div>
    <div className="form-field full"><label className="checkbox-row"><input type="checkbox" name="allDay" /> All-day appointment</label></div>
    <div className="form-field full"><button className="crm-button crm-button-primary" disabled={!hydrated || state === 'sending'}>{state === 'sending' ? 'Booking…' : 'Book appointment'}</button></div>
  </div></form>;
}
