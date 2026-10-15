'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useHydrated } from '@/lib/use-hydrated';

export function ClientCreateForm({ services, referrals }: { services: { id: string; title: string }[]; referrals: { id: string; reference: string; personName: string }[] }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState('sending'); setMessage('');
    const formElement = event.currentTarget;
    const response = await fetch('/api/crm/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(formElement).entries())) });
    const result = await response.json();
    if (response.ok) { setState('success'); setMessage(`Client ${result.reference ?? ''} added.`.trim()); formElement.reset(); router.refresh(); } else { setState('error'); setMessage(result.error ?? 'We could not add the client.'); }
  }
  return <form id="new" className="form-card" onSubmit={submit} method="post"><h2>Add client</h2>{message && <div className={state === 'success' ? 'form-success' : 'form-error'} role="status">{message}</div>}<div className="form-grid">
    <div className="form-field"><label htmlFor="cli-name">Display name</label><input id="cli-name" name="displayName" placeholder="A. Morgan" required /></div>
    <div className="form-field"><label htmlFor="cli-dob">Date of birth</label><input id="cli-dob" name="dateOfBirth" type="date" /></div>
    <div className="form-field"><label htmlFor="cli-service">Service</label><select id="cli-service" name="serviceId" defaultValue=""><option value="">No linked service</option>{services.map((service) => <option key={service.id} value={service.id}>{service.title}</option>)}</select></div>
    <div className="form-field"><label htmlFor="cli-referral">Linked referral</label><select id="cli-referral" name="referralId" defaultValue=""><option value="">None</option>{referrals.map((referral) => <option key={referral.id} value={referral.id}>{referral.reference} · {referral.personName}</option>)}</select></div>
    <div className="form-field"><label htmlFor="cli-risk">Risk level</label><select id="cli-risk" name="riskLevel" defaultValue="Medium"><option>Low</option><option>Medium</option><option>High</option></select></div>
    <div className="form-field"><label htmlFor="cli-status">Status</label><select id="cli-status" name="status" defaultValue="WAITLIST"><option value="WAITLIST">Waitlist</option><option value="CURRENT">Current</option><option value="MOVED_ON">Moved on</option><option value="ARCHIVED">Archived</option></select></div>
    <div className="form-field full"><label htmlFor="cli-comms">Communication needs</label><textarea id="cli-comms" name="communicationNeeds" /></div>
    <div className="form-field full"><label className="checkbox-row"><input type="checkbox" name="restricted" /> Restricted record</label></div>
    <div className="form-field full"><button className="crm-button crm-button-primary" disabled={!hydrated || state === 'sending'}>{state === 'sending' ? 'Adding…' : 'Add client'}</button></div>
  </div></form>;
}
