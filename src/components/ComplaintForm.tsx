'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { COMPLAINT_CATEGORIES, COMPLAINT_RAISED_BY, COMPLAINT_STAGES } from '@/lib/complaints-domain';
import { CONCERN_SEVERITIES } from '@/lib/concerns-domain';
import { useHydrated } from '@/lib/use-hydrated';

type Option = { id: string; label: string };
const label = (value: string) => value.replace(/_/g, ' ').toLowerCase();

export function ComplaintForm({ clients, staff }: { clients: Option[]; staff: Option[] }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState('sending'); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const receivedAt = String(form.get('receivedAt') ?? '').trim();
    const payload = {
      title: form.get('title'),
      summary: form.get('summary'),
      category: form.get('category'),
      severity: form.get('severity'),
      stage: form.get('stage'),
      raisedBy: form.get('raisedBy'),
      complainantName: form.get('complainantName') || undefined,
      clientId: form.get('clientId') || undefined,
      ownerId: form.get('ownerId') || undefined,
      receivedAt: receivedAt ? new Date(receivedAt).toISOString() : undefined
    };
    const response = await fetch('/api/crm/complaints', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (response.ok) { setState('success'); setMessage(`Complaint ${result.reference ?? ''} logged — acknowledge by ${result.acknowledgeBy ? new Date(result.acknowledgeBy).toLocaleDateString('en-GB') : 'the statutory deadline'}.`); formElement.reset(); router.refresh(); } else { setState('error'); setMessage(result.error ?? 'We could not log the complaint.'); }
  }
  return <form id="new" className="form-card" onSubmit={submit} method="post"><h2>Log a complaint</h2>{message && <div className={state === 'success' ? 'form-success' : 'form-error'} role="status">{message}</div>}<div className="form-grid">
    <div className="form-field full"><label htmlFor="cp-title">Title</label><input id="cp-title" name="title" required /></div>
    <div className="form-field"><label htmlFor="cp-category">Category</label><select id="cp-category" name="category" defaultValue="SERVICE">{COMPLAINT_CATEGORIES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></div>
    <div className="form-field"><label htmlFor="cp-severity">Severity</label><select id="cp-severity" name="severity" defaultValue="MEDIUM">{CONCERN_SEVERITIES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></div>
    <div className="form-field"><label htmlFor="cp-stage">Stage</label><select id="cp-stage" name="stage" defaultValue="STAGE_1">{COMPLAINT_STAGES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></div>
    <div className="form-field"><label htmlFor="cp-raised">Raised by</label><select id="cp-raised" name="raisedBy" defaultValue="SERVICE_USER">{COMPLAINT_RAISED_BY.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></div>
    <div className="form-field"><label htmlFor="cp-name">Complainant name</label><input id="cp-name" name="complainantName" /></div>
    <div className="form-field"><label htmlFor="cp-date">Date received</label><input id="cp-date" name="receivedAt" type="date" /></div>
    <div className="form-field"><label htmlFor="cp-client">Person</label><select id="cp-client" name="clientId" defaultValue=""><option value="">Not linked to a client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.label}</option>)}</select></div>
    <div className="form-field"><label htmlFor="cp-owner">Owner</label><select id="cp-owner" name="ownerId" defaultValue=""><option value="">Unassigned</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}</select></div>
    <div className="form-field full"><label htmlFor="cp-summary">What was said, in the complainant&rsquo;s own terms?</label><textarea id="cp-summary" name="summary" required /></div>
    <div className="form-field full"><button className="crm-button crm-button-primary" disabled={!hydrated || state === 'sending'}>{state === 'sending' ? 'Logging…' : 'Log complaint'}</button></div>
  </div></form>;
}
