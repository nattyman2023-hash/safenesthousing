'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useHydrated } from '@/lib/use-hydrated';

export function RoomCreateForm({ propertyId }: { propertyId: string }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState('sending'); setMessage('');
    const formElement = event.currentTarget;
    const response = await fetch('/api/crm/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(formElement).entries())) });
    const result = await response.json();
    if (response.ok) { setState('success'); setMessage('Room added.'); formElement.reset(); router.refresh(); } else { setState('error'); setMessage(result.error ?? 'We could not add the room.'); }
  }
  return <form id="room" className="form-card" onSubmit={submit} method="post"><h2>Add room</h2>{message && <div className={state === 'success' ? 'form-success' : 'form-error'} role="status">{message}</div>}<input type="hidden" name="propertyId" value={propertyId} /><div className="form-grid">
    <div className="form-field"><label htmlFor="room-label">Room label</label><input id="room-label" name="label" placeholder="Room 5" required /></div>
    <div className="form-field"><label htmlFor="room-status">Status</label><select id="room-status" name="status" defaultValue="AVAILABLE"><option value="AVAILABLE">Available</option><option value="OCCUPIED">Occupied</option><option value="OFFERED">Offered</option><option value="VOID">Void</option><option value="MAINTENANCE">Maintenance</option></select></div>
    <div className="form-field full"><label htmlFor="room-notes">Notes</label><textarea id="room-notes" name="notes" /></div>
    <div className="form-field full"><button className="crm-button crm-button-primary" disabled={!hydrated || state === 'sending'}>{state === 'sending' ? 'Adding…' : 'Add room'}</button></div>
  </div></form>;
}
