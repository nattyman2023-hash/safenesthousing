'use client';

import { useState } from 'react';
import type { Service } from '@prisma/client';

export function CrmReferralForm({ services }: { services: Pick<Service, 'id' | 'title'>[] }) {
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState('sending'); setMessage('');
    const formElement = event.currentTarget;
    const response = await fetch('/api/crm/referrals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(formElement).entries())) });
    const result = await response.json();
    if (response.ok) { setState('success'); setMessage(`Referral ${result.reference} saved.`); formElement.reset(); } else { setState('error'); setMessage(result.error ?? 'We could not save the referral.'); }
  }
  return <form className="form-card" onSubmit={submit}><h2>Referral details</h2><p>Keep the initial record factual and limited to what is needed for triage.</p>{message && <div className={state === 'success' ? 'form-success' : 'form-error'} role="status">{message}</div>}<div className="form-grid"><div className="form-field"><label htmlFor="personName">Person or permitted identifier</label><input id="personName" name="personName" required /></div><div className="form-field"><label htmlFor="serviceId">Requested service</label><select id="serviceId" name="serviceId" defaultValue="" required><option value="">Choose a service</option>{services.map((service) => <option key={service.id} value={service.id}>{service.title}</option>)}</select></div><div className="form-field"><label htmlFor="referrerName">Referrer name</label><input id="referrerName" name="referrerName" required /></div><div className="form-field"><label htmlFor="referrerEmail">Referrer email</label><input id="referrerEmail" name="referrerEmail" type="email" required /></div><div className="form-field"><label htmlFor="referrerOrganisation">Referrer organisation</label><input id="referrerOrganisation" name="referrerOrganisation" /></div><div className="form-field"><label htmlFor="risk">Initial risk level</label><select id="risk" name="risk" defaultValue="Medium"><option>Low</option><option>Medium</option><option>High</option></select></div><div className="form-field full"><label htmlFor="currentLocation">Current location or housing situation</label><textarea id="currentLocation" name="currentLocation" required /></div><div className="form-field full"><label htmlFor="housingSituation">What is happening now?</label><textarea id="housingSituation" name="housingSituation" required /></div><div className="form-field full"><label htmlFor="supportNeeds">Support needs</label><textarea id="supportNeeds" name="supportNeeds" required /></div><div className="form-field full"><label htmlFor="knownRisks">Known risks</label><textarea id="knownRisks" name="knownRisks" /></div><div className="form-field full"><button className="crm-button crm-button-primary" disabled={state === 'sending'}>{state === 'sending' ? 'Saving…' : 'Save referral'}</button></div></div></form>;
}
