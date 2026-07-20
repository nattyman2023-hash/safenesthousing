'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function RotaShiftForm({ users, properties, services }: { users: { id: string; name: string }[]; properties: { id: string; publicName: string }[]; services: { id: string; title: string }[] }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const formElement = event.currentTarget;
    const response = await fetch('/api/crm/rota/shifts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(formElement).entries())) });
    const result = await response.json();
    if (response.ok) { setMessage('Shift created.'); formElement.reset(); router.refresh(); } else setMessage(result.error ?? 'We could not create the shift.');
    setBusy(false);
  }
  return <form id="new" className="form-card" onSubmit={submit}><h2>Create rota shift</h2>{message && <div className={message === 'Shift created.' ? 'form-success' : 'form-error'} role="status">{message}</div>}<div className="form-grid"><div className="form-field"><label htmlFor="shift-type">Shift type</label><input id="shift-type" name="shiftType" placeholder="Day support" required /></div><div className="form-field"><label htmlFor="shift-property">Property</label><select id="shift-property" name="propertyId" defaultValue=""><option value="">No property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.publicName}</option>)}</select></div><div className="form-field"><label htmlFor="shift-service">Service</label><select id="shift-service" name="serviceId" defaultValue=""><option value="">No service</option>{services.map((service) => <option key={service.id} value={service.id}>{service.title}</option>)}</select></div><div className="form-field"><label htmlFor="shift-start">Starts</label><input id="shift-start" name="startsAt" type="datetime-local" required /></div><div className="form-field"><label htmlFor="shift-end">Ends</label><input id="shift-end" name="endsAt" type="datetime-local" required /></div><div className="form-field"><label htmlFor="shift-assignee">Assign to</label><select id="shift-assignee" name="assignedUserId" defaultValue=""><option value="">Unfilled</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></div><div className="form-field full"><label htmlFor="shift-handover">Handover notes</label><textarea id="shift-handover" name="handover" /></div><div className="form-field full"><label htmlFor="shift-override">Authorised conflict override reason</label><input id="shift-override" name="overrideReason" placeholder="Only required for an approved overlap" /></div><div className="form-field full"><button className="crm-button crm-button-primary" disabled={busy}>{busy ? 'Creating…' : 'Create shift'}</button></div></div></form>;
}
