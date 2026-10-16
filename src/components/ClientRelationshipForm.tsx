'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useHydrated } from '@/lib/use-hydrated';

type RelationshipType = { key: string; label: string };
type ClientOption = { id: string; displayName: string; reference: string };

/**
 * Records a relationship from this profile. A relationship is stored once, on the profile where it
 * is entered, and is then readable from the other person's profile with the inverse label (see
 * lib/client-relationships.ts) — so linking two service users never needs a second entry, and the
 * related-person record is available for anyone outside the service.
 */
export function ClientRelationshipForm({ clientId, clients, types }: { clientId: string; clients: ClientOption[]; types: RelationshipType[] }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [mode, setMode] = useState<'client' | 'person'>('client');
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const linkable = clients.filter((option) => option.id !== clientId);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('sending');
    setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload: Record<string, unknown> = {
      relationshipType: String(form.get('relationshipType') ?? ''),
      isNextOfKin: form.get('isNextOfKin') === 'on',
      isEmergencyContact: form.get('isEmergencyContact') === 'on'
    };
    const startDate = String(form.get('startDate') ?? '').trim();
    if (startDate) payload.startDate = startDate;
    const notes = String(form.get('notes') ?? '').trim();
    if (notes) payload.notes = notes;

    // Both required fields carry the `required` attribute, so the browser refuses an empty
    // submission before this handler runs — the convention the rest of the CRM follows, so the
    // control can never appear to do nothing. Re-checking the same thing here would be unreachable
    // code that reads as coverage it does not provide; the API remains the backstop for anything
    // that reaches it without those fields.
    if (mode === 'client') {
      payload.relatedClientId = String(form.get('relatedClientId') ?? '').trim();
    } else {
      payload.fullName = String(form.get('fullName') ?? '').trim();
      for (const field of ['phone', 'email', 'address', 'preferredContactMethod']) {
        const value = String(form.get(field) ?? '').trim();
        if (value) payload[field] = value;
      }
      payload.consentToContact = form.get('consentToContact') === 'on';
    }

    const response = await fetch(`/api/crm/clients/${clientId}/relationships`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({} as { error?: string }));
    if (response.ok) {
      setState('success');
      setMessage(mode === 'client' ? 'Relationship recorded. It now shows on both profiles.' : 'External contact linked to this profile.');
      formElement.reset();
      router.refresh();
    } else {
      setState('error');
      setMessage(result.error ?? 'We could not save the relationship.');
    }
  }

  return <form id="relationship" className="form-card" onSubmit={submit} method="post">
    <h2>Add a relationship</h2>
    {message && <div className={state === 'success' ? 'form-success' : 'form-error'} role="status">{message}</div>}
    <div className="form-grid">
      <div className="form-field full">
        <div className="inline-control" role="group" aria-label="What kind of relationship">
          <button type="button" className={mode === 'client' ? 'crm-button crm-button-primary' : 'crm-button crm-button-secondary'} aria-pressed={mode === 'client'} onClick={() => setMode('client')}>Another service user</button>
          <button type="button" className={mode === 'person' ? 'crm-button crm-button-primary' : 'crm-button crm-button-secondary'} aria-pressed={mode === 'person'} onClick={() => setMode('person')}>External contact</button>
        </div>
      </div>
      {mode === 'client'
        ? <div className="form-field"><label htmlFor="relationship-client">Person</label><select id="relationship-client" name="relatedClientId" defaultValue="" required><option value="">Choose a service user</option>{linkable.map((option) => <option key={option.id} value={option.id}>{option.displayName} ({option.reference})</option>)}</select></div>
        : <div className="form-field"><label htmlFor="relationship-name">Full name</label><input id="relationship-name" name="fullName" required /></div>}
      <div className="form-field">
        <label htmlFor="relationship-type">How they relate to this person</label>
        <select id="relationship-type" name="relationshipType" defaultValue="" required>
          <option value="">Choose a relationship</option>
          {types.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
        </select>
      </div>
      <div className="form-field"><label htmlFor="relationship-start">Known since</label><input id="relationship-start" name="startDate" type="date" /></div>
      {mode === 'person' && <>
        <div className="form-field"><label htmlFor="relationship-phone">Phone</label><input id="relationship-phone" name="phone" /></div>
        <div className="form-field"><label htmlFor="relationship-email">Email</label><input id="relationship-email" name="email" type="email" /></div>
        <div className="form-field"><label htmlFor="relationship-method">Preferred contact</label><input id="relationship-method" name="preferredContactMethod" placeholder="Phone, letter, in person…" /></div>
        <div className="form-field full"><label htmlFor="relationship-address">Address</label><input id="relationship-address" name="address" /></div>
        <div className="form-field full"><label className="checkbox-row"><input type="checkbox" name="consentToContact" /> This person has consented to be contacted</label></div>
      </>}
      <div className="form-field full"><label htmlFor="relationship-notes">Notes</label><textarea id="relationship-notes" name="notes" maxLength={3000} /></div>
      <div className="form-field full"><label className="checkbox-row"><input type="checkbox" name="isNextOfKin" /> Next of kin</label></div>
      <div className="form-field full"><label className="checkbox-row"><input type="checkbox" name="isEmergencyContact" /> Emergency contact</label></div>
      <div className="form-field full"><button className="crm-button crm-button-primary" disabled={!hydrated || state === 'sending'}>{state === 'sending' ? 'Saving…' : 'Save relationship'}</button></div>
    </div>
  </form>;
}

