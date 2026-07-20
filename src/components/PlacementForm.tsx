'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type ClientOption = { id: string; reference: string; displayName: string };
type PropertyOption = { id: string; publicName: string; rooms: { id: string; label: string; status: string }[] };

export function PlacementForm({ clients, properties }: { clients: ClientOption[]; properties: PropertyOption[] }) {
  const router = useRouter();
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? '');
  const [roomId, setRoomId] = useState(properties[0]?.rooms.find((room) => room.status === 'AVAILABLE')?.id ?? properties[0]?.rooms[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const property = properties.find((item) => item.id === propertyId);
  function changeProperty(nextPropertyId: string) { const nextProperty = properties.find((item) => item.id === nextPropertyId); setPropertyId(nextPropertyId); setRoomId(nextProperty?.rooms.find((room) => room.status === 'AVAILABLE')?.id ?? nextProperty?.rooms[0]?.id ?? ''); }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(''); setError('');
    const formElement = event.currentTarget;
    const response = await fetch('/api/crm/placements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(formElement).entries())) });
    const result = await response.json();
    if (response.ok) { setMessage('Placement created and room marked occupied.'); formElement.reset(); router.refresh(); } else setError(result.error ?? 'We could not create the placement.');
    setBusy(false);
  }
  return <form id="new" className="form-card" onSubmit={submit}><h2>Create placement</h2><p>Assign a client to a room. The server blocks overlapping room or client occupancy.</p>{message && <div className="form-success" role="status">{message}</div>}{error && <div className="form-error" role="alert">{error}</div>}<div className="form-grid"><div className="form-field full"><label htmlFor="placement-client">Client</label><select id="placement-client" name="clientId" required defaultValue={clients[0]?.id ?? ''}>{clients.map((client) => <option key={client.id} value={client.id}>{client.reference} · {client.displayName}</option>)}</select></div><div className="form-field"><label htmlFor="placement-property">Property</label><select id="placement-property" name="propertyId" value={propertyId} onChange={(event) => changeProperty(event.target.value)} required>{properties.map((item) => <option key={item.id} value={item.id}>{item.publicName}</option>)}</select></div><div className="form-field"><label htmlFor="placement-room">Room</label><select id="placement-room" name="roomId" value={roomId} onChange={(event) => setRoomId(event.target.value)} required>{property?.rooms.map((room) => <option key={room.id} value={room.id} disabled={room.status !== 'AVAILABLE'}>{room.label} · {room.status.toLowerCase()}</option>)}</select></div><div className="form-field"><label htmlFor="placement-start">Start date</label><input id="placement-start" name="startDate" type="date" required /></div><div className="form-field"><label htmlFor="placement-tenancy">Tenancy reference</label><input id="placement-tenancy" name="tenancyRef" /></div><div className="form-field full"><button className="crm-button crm-button-primary" disabled={busy || !clients.length || !properties.length}>{busy ? 'Creating…' : 'Create placement'}</button></div></div></form>;
}
