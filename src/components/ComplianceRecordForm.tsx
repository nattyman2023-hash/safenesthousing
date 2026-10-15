'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { COMPLIANCE_STATUSES, PROPERTY_COMPLIANCE_TYPES } from '@/lib/compliance-domain';
import { useHydrated } from '@/lib/use-hydrated';

const label = (value: string) => value.replace(/_/g, ' ').toLowerCase();
const iso = (value: FormDataEntryValue | null) => { const text = String(value ?? '').trim(); return text ? new Date(text).toISOString() : undefined; };

export function ComplianceRecordForm({ properties }: { properties: { id: string; label: string }[] }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState('sending'); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      propertyId: form.get('propertyId'),
      complianceType: form.get('complianceType'),
      status: form.get('status'),
      lastCheckedAt: iso(form.get('lastCheckedAt')),
      nextDueAt: iso(form.get('nextDueAt')),
      certificateRef: form.get('certificateRef') || undefined,
      contractor: form.get('contractor') || undefined,
      outcome: form.get('outcome') || undefined,
      notes: form.get('notes') || undefined
    };
    const response = await fetch('/api/crm/compliance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (response.ok) { setState('success'); setMessage(`Compliance record ${result.created === false ? 'updated' : 'created'} — status ${label(String(result.status ?? 'DUE'))}.`); formElement.reset(); router.refresh(); } else { setState('error'); setMessage(result.error ?? 'We could not save the compliance record.'); }
  }
  return <form id="new" className="form-card" onSubmit={submit} method="post"><h2>Record a compliance obligation</h2>{message && <div className={state === 'success' ? 'form-success' : 'form-error'} role="status">{message}</div>}<div className="form-grid">
    <div className="form-field"><label htmlFor="cm-property">Property</label><select id="cm-property" name="propertyId" defaultValue="" required><option value="">Choose a property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.label}</option>)}</select></div>
    <div className="form-field"><label htmlFor="cm-type">Obligation</label><select id="cm-type" name="complianceType" defaultValue="GAS_SAFETY">{PROPERTY_COMPLIANCE_TYPES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></div>
    <div className="form-field"><label htmlFor="cm-status">Status</label><select id="cm-status" name="status" defaultValue="DUE">{COMPLIANCE_STATUSES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></div>
    <div className="form-field"><label htmlFor="cm-ref">Certificate reference</label><input id="cm-ref" name="certificateRef" /></div>
    <div className="form-field"><label htmlFor="cm-checked">Last checked</label><input id="cm-checked" name="lastCheckedAt" type="date" /></div>
    <div className="form-field"><label htmlFor="cm-due">Next due</label><input id="cm-due" name="nextDueAt" type="date" /></div>
    <div className="form-field"><label htmlFor="cm-contractor">Contractor</label><input id="cm-contractor" name="contractor" /></div>
    <div className="form-field full"><label htmlFor="cm-outcome">Outcome</label><textarea id="cm-outcome" name="outcome" /></div>
    <div className="form-field full"><label htmlFor="cm-notes">Notes</label><textarea id="cm-notes" name="notes" /></div>
    <div className="form-field full"><button className="crm-button crm-button-primary" disabled={!hydrated || state === 'sending'}>{state === 'sending' ? 'Saving…' : 'Save record'}</button></div>
  </div></form>;
}
