'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useHydrated } from '@/lib/use-hydrated';

export function IncidentCreateForm({ clients, lockedClient }: { clients: { id: string; displayName: string; reference: string }[]; lockedClient?: { id: string; displayName: string; reference: string } }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState('sending'); setMessage('');
    const formElement = event.currentTarget;
    const response = await fetch('/api/crm/incidents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(formElement).entries())) });
    const result = await response.json();
    if (response.ok) { setState('success'); setMessage(`Incident ${result.reference ?? ''} recorded.`.trim()); formElement.reset(); router.refresh(); } else { setState('error'); setMessage(result.error ?? 'We could not record the incident.'); }
  }
  return <form id="new" className="form-card" onSubmit={submit} method="post"><h2>Record incident</h2>{message && <div className={state === 'success' ? 'form-success' : 'form-error'} role="status">{message}</div>}{lockedClient && <p>This incident will be linked to {lockedClient.displayName} ({lockedClient.reference}).</p>}<div className="form-grid">
    {lockedClient ? <div className="form-field"><label htmlFor="inc-client">Person involved</label><input id="inc-client" value={`${lockedClient.displayName} (${lockedClient.reference})`} readOnly /><input type="hidden" name="clientId" value={lockedClient.id} /></div>
      : <div className="form-field"><label htmlFor="inc-client">Person involved</label><select id="inc-client" name="clientId" defaultValue=""><option value="">Not linked to a client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.displayName} ({client.reference})</option>)}</select></div>}
    <div className="form-field"><label htmlFor="inc-category">Category</label><input id="inc-category" name="category" placeholder="Welfare concern" required /></div>
    <div className="form-field"><label htmlFor="inc-severity">Severity</label><select id="inc-severity" name="severity" defaultValue="Medium"><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></div>
    <div className="form-field"><label htmlFor="inc-at">Date &amp; time</label><input id="inc-at" name="incidentAt" type="datetime-local" required /></div>
    <div className="form-field full"><label htmlFor="inc-location">Location</label><input id="inc-location" name="location" /></div>
    <div className="form-field full"><label htmlFor="inc-description">Description</label><textarea id="inc-description" name="description" required /></div>
    <div className="form-field full"><label htmlFor="inc-action">Immediate action taken</label><textarea id="inc-action" name="immediateAction" /></div>
    <div className="form-field full"><label className="checkbox-row"><input type="checkbox" name="restricted" defaultChecked /> Restricted record</label></div>
    <div className="form-field full"><button className="crm-button crm-button-primary" disabled={!hydrated || state === 'sending'}>{state === 'sending' ? 'Recording…' : 'Record incident'}</button></div>
  </div></form>;
}
