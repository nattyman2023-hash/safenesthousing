'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CONCERN_CATEGORIES, CONCERN_SEVERITIES, CONCERN_STATUSES } from '@/lib/concerns-domain';
import { useHydrated } from '@/lib/use-hydrated';

type Option = { id: string; label: string };

export function ConcernForm({ clients, properties, staff }: { clients: Option[]; properties: Option[]; staff: Option[] }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState('sending'); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const dueAt = String(form.get('dueAt') ?? '').trim();
    const payload = {
      title: form.get('title'),
      summary: form.get('summary'),
      category: form.get('category'),
      severity: form.get('severity'),
      clientId: form.get('clientId') || undefined,
      propertyId: form.get('propertyId') || undefined,
      ownerId: form.get('ownerId') || undefined,
      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      referralNeeded: form.get('referralNeeded') === 'on'
    };
    const response = await fetch('/api/crm/concerns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (response.ok) { setState('success'); setMessage(`Concern ${result.reference ?? ''} raised${result.referralNeeded ? ' — referral to be considered.' : '.'}`); formElement.reset(); router.refresh(); } else { setState('error'); setMessage(result.error ?? 'We could not raise the concern.'); }
  }
  return <form id="new" className="form-card" onSubmit={submit} method="post"><h2>Raise a concern</h2>{message && <div className={state === 'success' ? 'form-success' : 'form-error'} role="status">{message}</div>}<div className="form-grid">
    <div className="form-field full"><label htmlFor="cn-title">Title</label><input id="cn-title" name="title" required /></div>
    <div className="form-field"><label htmlFor="cn-category">Category</label><select id="cn-category" name="category" defaultValue="WELFARE">{CONCERN_CATEGORIES.map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ').toLowerCase()}</option>)}</select></div>
    <div className="form-field"><label htmlFor="cn-severity">Severity</label><select id="cn-severity" name="severity" defaultValue="MEDIUM">{CONCERN_SEVERITIES.map((value) => <option key={value} value={value}>{value.toLowerCase()}</option>)}</select></div>
    <div className="form-field"><label htmlFor="cn-client">Person</label><select id="cn-client" name="clientId" defaultValue=""><option value="">Not linked to a client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.label}</option>)}</select></div>
    <div className="form-field"><label htmlFor="cn-property">Property</label><select id="cn-property" name="propertyId" defaultValue=""><option value="">No property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.label}</option>)}</select></div>
    <div className="form-field"><label htmlFor="cn-owner">Owner</label><select id="cn-owner" name="ownerId" defaultValue=""><option value="">Unassigned</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}</select></div>
    <div className="form-field"><label htmlFor="cn-due">Action due</label><input id="cn-due" name="dueAt" type="date" /></div>
    <div className="form-field full"><label htmlFor="cn-summary">What has been noticed, and by whom?</label><textarea id="cn-summary" name="summary" required /></div>
    <div className="form-field full"><label className="checkbox-row"><input type="checkbox" name="referralNeeded" /> Consider an external referral</label></div>
    <div className="form-field full"><button className="crm-button crm-button-primary" disabled={!hydrated || state === 'sending'}>{state === 'sending' ? 'Raising…' : 'Raise concern'}</button></div>
  </div></form>;
}

export function ConcernUpdateControl({ concernId, status }: { concernId: string; status: string }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/crm/concerns/${concernId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: form.get('status'), action: form.get('action'), resolution: form.get('resolution') || undefined })
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(result.error ?? 'We could not update the concern.'); return; }
    router.refresh();
  }
  return <form className="inline-control" onSubmit={submit} method="post">
    <select name="status" aria-label="Concern status" defaultValue={status}>{CONCERN_STATUSES.map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ').toLowerCase()}</option>)}</select>
    <input name="action" placeholder="Action taken" aria-label="Action taken" required />
    <input name="resolution" placeholder="Resolution (optional)" aria-label="Resolution" />
    <button className="crm-button crm-button-secondary" disabled={!hydrated || busy}>{busy ? 'Saving…' : 'Save'}</button>
    {error && <span className="form-error" role="status">{error}</span>}
  </form>;
}
