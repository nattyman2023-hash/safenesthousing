'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Shift = { id: string; shiftType: string; startsAt: Date | string; endsAt: Date | string; handover: string | null; overrideReason: string | null; propertyId: string | null; serviceId: string | null };

function toDatetimeLocal(value: Date | string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function RotaShiftEditForm({ shift, assignedUserId, users, properties, services }: { shift: Shift; assignedUserId: string | null; users: { id: string; name: string }[]; properties: { id: string; publicName: string }[]; services: { id: string; title: string }[] }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const formElement = event.currentTarget;
    const response = await fetch(`/api/crm/rota/shifts/${shift.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(formElement).entries())) });
    const result = await response.json();
    if (response.ok) { setMessage('Shift saved.'); router.refresh(); } else setMessage(result.error ?? 'We could not save this shift.');
    setBusy(false);
  }

  return <form className="form-grid" onSubmit={submit}>
    {message && <div className={message === 'Shift saved.' ? 'form-success' : 'form-error'} role="status" style={{ gridColumn: '1 / -1' }}>{message}</div>}
    <div className="form-field"><label htmlFor="shift-type">Shift type</label><input id="shift-type" name="shiftType" defaultValue={shift.shiftType} required minLength={2} maxLength={100} /></div>
    <div className="form-field"><label htmlFor="shift-property">Property</label><select id="shift-property" name="propertyId" defaultValue={shift.propertyId ?? ''}><option value="">No property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.publicName}</option>)}</select></div>
    <div className="form-field"><label htmlFor="shift-service">Service</label><select id="shift-service" name="serviceId" defaultValue={shift.serviceId ?? ''}><option value="">No service</option>{services.map((service) => <option key={service.id} value={service.id}>{service.title}</option>)}</select></div>
    <div className="form-field"><label htmlFor="shift-start">Starts</label><input id="shift-start" name="startsAt" type="datetime-local" defaultValue={toDatetimeLocal(shift.startsAt)} required /></div>
    <div className="form-field"><label htmlFor="shift-end">Ends</label><input id="shift-end" name="endsAt" type="datetime-local" defaultValue={toDatetimeLocal(shift.endsAt)} required /></div>
    <div className="form-field"><label htmlFor="shift-assignee">Assign to</label><select id="shift-assignee" name="assignedUserId" defaultValue={assignedUserId ?? ''}><option value="">Unfilled</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></div>
    <div className="form-field full"><label htmlFor="shift-handover">Handover notes</label><textarea id="shift-handover" name="handover" defaultValue={shift.handover ?? ''} /></div>
    <div className="form-field full"><label htmlFor="shift-override">Authorised conflict override reason</label><input id="shift-override" name="overrideReason" defaultValue={shift.overrideReason ?? ''} placeholder="Only required for an approved overlap" /></div>
    <div className="form-field full"><button className="crm-button crm-button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save shift'}</button></div>
  </form>;
}
