'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function PropertyCreateForm({ services }: { services: { id: string; title: string }[] }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState('sending'); setMessage('');
    const formElement = event.currentTarget;
    const response = await fetch('/api/crm/properties', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(formElement).entries())) });
    const result = await response.json();
    if (response.ok) { setState('success'); setMessage('Property added to the portfolio.'); formElement.reset(); router.refresh(); } else { setState('error'); setMessage(result.error ?? 'We could not add the property.'); }
  }
  return <form id="new" className="form-card" onSubmit={submit}><h2>Add property</h2>{message && <div className={state === 'success' ? 'form-success' : 'form-error'} role="status">{message}</div>}<div className="form-grid">
    <div className="form-field"><label htmlFor="prop-name">Property name</label><input id="prop-name" name="publicName" placeholder="Willow House" required /></div>
    <div className="form-field"><label htmlFor="prop-service">Service</label><select id="prop-service" name="serviceId" defaultValue=""><option value="">No linked service</option>{services.map((service) => <option key={service.id} value={service.id}>{service.title}</option>)}</select></div>
    <div className="form-field"><label htmlFor="prop-neighbourhood">Neighbourhood</label><input id="prop-neighbourhood" name="neighbourhood" placeholder="Northside" required /></div>
    <div className="form-field"><label htmlFor="prop-type">Service type</label><input id="prop-type" name="serviceType" placeholder="Domestic abuse" required /></div>
    <div className="form-field"><label htmlFor="prop-capacity">Capacity (rooms)</label><input id="prop-capacity" name="capacity" type="number" min="1" defaultValue="1" required /></div>
    <div className="form-field"><label htmlFor="prop-vacancy">Public vacancy state</label><input id="prop-vacancy" name="publicVacancyState" placeholder="Rooms available" defaultValue="Rooms available" required /></div>
    <div className="form-field full"><label htmlFor="prop-summary">Public summary</label><textarea id="prop-summary" name="publicSummary" required /></div>
    <div className="form-field full"><label htmlFor="prop-eligibility">Eligibility</label><textarea id="prop-eligibility" name="eligibility" required /></div>
    <div className="form-field full"><label htmlFor="prop-access">Accessibility</label><input id="prop-access" name="accessibility" /></div>
    <div className="form-field full"><label className="checkbox-row"><input type="checkbox" name="confidential" /> Confidential address</label></div>
    <div className="form-field full"><button className="crm-button crm-button-primary" disabled={state === 'sending'}>{state === 'sending' ? 'Adding…' : 'Add property'}</button></div>
  </div></form>;
}
