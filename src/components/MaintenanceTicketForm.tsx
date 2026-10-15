'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MAINTENANCE_CATEGORIES, MAINTENANCE_PRIORITIES, MAINTENANCE_STATUSES, MAINTENANCE_TRADES } from '@/lib/operations-domain';
import { useHydrated } from '@/lib/use-hydrated';

export function MaintenanceTicketForm({ properties, clients }: { properties: { id: string; label: string }[]; clients: { id: string; label: string }[] }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState('sending'); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const targetFixAt = String(form.get('targetFixAt') ?? '').trim();
    const payload = {
      title: form.get('title'),
      description: form.get('description') || undefined,
      category: form.get('category'),
      trade: form.get('trade'),
      priority: form.get('priority'),
      propertyId: form.get('propertyId') || undefined,
      clientId: form.get('clientId') || undefined,
      safetyRisk: form.get('safetyRisk') === 'on',
      contractor: form.get('contractor') || undefined,
      targetFixAt: targetFixAt ? new Date(targetFixAt).toISOString() : undefined
    };
    const response = await fetch('/api/crm/maintenance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (response.ok) { setState('success'); setMessage(`Repair ${result.reference ?? ''} logged at ${result.priority ?? 'medium'} priority.`.trim()); formElement.reset(); router.refresh(); } else { setState('error'); setMessage(result.error ?? 'We could not log the repair.'); }
  }
  return <form id="new" className="form-card" onSubmit={submit} method="post"><h2>Log a repair</h2>{message && <div className={state === 'success' ? 'form-success' : 'form-error'} role="status">{message}</div>}<div className="form-grid">
    <div className="form-field full"><label htmlFor="mt-title">What needs fixing?</label><input id="mt-title" name="title" required /></div>
    <div className="form-field"><label htmlFor="mt-category">Category</label><select id="mt-category" name="category" defaultValue="GENERAL">{MAINTENANCE_CATEGORIES.map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ').toLowerCase()}</option>)}</select></div>
    <div className="form-field"><label htmlFor="mt-trade">Trade</label><select id="mt-trade" name="trade" defaultValue="GENERAL">{MAINTENANCE_TRADES.map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ').toLowerCase()}</option>)}</select></div>
    <div className="form-field"><label htmlFor="mt-priority">Priority</label><select id="mt-priority" name="priority" defaultValue="MEDIUM">{MAINTENANCE_PRIORITIES.map((value) => <option key={value} value={value}>{value.toLowerCase()}</option>)}</select></div>
    <div className="form-field"><label htmlFor="mt-target">Target fix date</label><input id="mt-target" name="targetFixAt" type="datetime-local" /></div>
    <div className="form-field"><label htmlFor="mt-property">Property</label><select id="mt-property" name="propertyId" defaultValue=""><option value="">No property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.label}</option>)}</select></div>
    <div className="form-field"><label htmlFor="mt-client">Reported by person</label><select id="mt-client" name="clientId" defaultValue=""><option value="">Not linked to a client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.label}</option>)}</select></div>
    <div className="form-field"><label htmlFor="mt-contractor">Contractor</label><input id="mt-contractor" name="contractor" /></div>
    <div className="form-field full"><label htmlFor="mt-description">Description</label><textarea id="mt-description" name="description" /></div>
    <div className="form-field full"><label className="checkbox-row"><input type="checkbox" name="safetyRisk" /> Safety risk — needs immediate attention</label></div>
    <div className="form-field full"><button className="crm-button crm-button-primary" disabled={!hydrated || state === 'sending'}>{state === 'sending' ? 'Logging…' : 'Log repair'}</button></div>
  </div></form>;
}
