'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { POLICY_CATEGORIES, POLICY_STATUSES } from '@/lib/compliance-domain';
import { useHydrated } from '@/lib/use-hydrated';

const label = (value: string) => value.replace(/_/g, ' ').toLowerCase();

export function PolicyResourceForm({ staff }: { staff: { id: string; label: string }[] }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState('sending'); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const effectiveFrom = String(form.get('effectiveFrom') ?? '').trim();
    const reviewDueAt = String(form.get('reviewDueAt') ?? '').trim();
    const payload = {
      title: form.get('title'),
      category: form.get('category'),
      status: form.get('status'),
      summary: form.get('summary') || undefined,
      version: form.get('version') || undefined,
      externalUrl: form.get('externalUrl') || undefined,
      ownerId: form.get('ownerId') || undefined,
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom).toISOString() : undefined,
      reviewDueAt: reviewDueAt ? new Date(reviewDueAt).toISOString() : undefined,
      requiresRead: form.get('requiresRead') === 'on'
    };
    const response = await fetch('/api/crm/policies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (response.ok) { setState('success'); setMessage(`Policy saved as ${label(String(result.status ?? 'DRAFT'))}${result.reviewDueAt ? ` — review by ${new Date(result.reviewDueAt).toLocaleDateString('en-GB')}` : ''}.`); formElement.reset(); router.refresh(); } else { setState('error'); setMessage(result.error ?? 'We could not save the policy.'); }
  }
  return <form id="new" className="form-card" onSubmit={submit} method="post"><h2>Add a policy or resource</h2>{message && <div className={state === 'success' ? 'form-success' : 'form-error'} role="status">{message}</div>}<div className="form-grid">
    <div className="form-field full"><label htmlFor="po-title">Title</label><input id="po-title" name="title" required /></div>
    <div className="form-field"><label htmlFor="po-category">Category</label><select id="po-category" name="category" defaultValue="POLICY">{POLICY_CATEGORIES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></div>
    <div className="form-field"><label htmlFor="po-status">Status</label><select id="po-status" name="status" defaultValue="DRAFT">{POLICY_STATUSES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></div>
    <div className="form-field"><label htmlFor="po-version">Version</label><input id="po-version" name="version" placeholder="3.1" /></div>
    <div className="form-field"><label htmlFor="po-owner">Owner</label><select id="po-owner" name="ownerId" defaultValue=""><option value="">Unassigned</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}</select></div>
    <div className="form-field"><label htmlFor="po-effective">Effective from</label><input id="po-effective" name="effectiveFrom" type="date" /></div>
    <div className="form-field"><label htmlFor="po-review">Review due</label><input id="po-review" name="reviewDueAt" type="date" /></div>
    <div className="form-field full"><label htmlFor="po-url">Link to the document</label><input id="po-url" name="externalUrl" placeholder="https://" /></div>
    <div className="form-field full"><label htmlFor="po-summary">Summary</label><textarea id="po-summary" name="summary" /></div>
    <div className="form-field full"><label className="checkbox-row"><input type="checkbox" name="requiresRead" /> Staff must confirm they have read this</label></div>
    <div className="form-field full"><button className="crm-button crm-button-primary" disabled={!hydrated || state === 'sending'}>{state === 'sending' ? 'Saving…' : 'Save policy'}</button></div>
  </div></form>;
}
