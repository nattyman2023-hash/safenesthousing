'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useHydrated } from '@/lib/use-hydrated';

type RelationshipType = { key: string; label: string };

export type EditableRelationship = {
  id: string;
  relationshipType: string;
  startDate: string;
  endDate: string;
  notes: string;
  isNextOfKin: boolean;
  isEmergencyContact: boolean;
  counterpartName: string;
};

/**
 * Edit and unlink controls for a relationship that this profile owns. The other person's profile
 * reads the same row as its inverse and never shows these controls, so a link can only be changed
 * from the side that recorded it.
 *
 * Unlinking deletes the relationship row and nothing else: both service users, their placements,
 * contacts and case notes are untouched, and an external contact's details stay on record so the
 * same person can be linked again without re-entering them.
 */
export function ClientRelationshipEditor({ clientId, types, relationship }: { clientId: string; types: RelationshipType[]; relationship: EditableRelationship }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const endpoint = `/api/crm/clients/${clientId}/relationships/${relationship.id}`;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const form = new FormData(event.currentTarget);
    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        relationshipType: form.get('relationshipType'),
        startDate: String(form.get('startDate') ?? '').trim(),
        endDate: String(form.get('endDate') ?? '').trim(),
        notes: String(form.get('notes') ?? '').trim(),
        isNextOfKin: form.get('isNextOfKin') === 'on',
        isEmergencyContact: form.get('isEmergencyContact') === 'on'
      })
    });
    const result = await response.json().catch(() => ({} as { error?: string }));
    setBusy(false);
    if (!response.ok) { setError(result.error ?? 'We could not update the relationship.'); return; }
    setMessage(`${relationship.counterpartName} updated. The change shows on both profiles.`);
    router.refresh();
  }

  async function unlink() {
    setBusy(true);
    setError('');
    setMessage('');
    const response = await fetch(endpoint, { method: 'DELETE' });
    const result = await response.json().catch(() => ({} as { error?: string }));
    setBusy(false);
    setConfirming(false);
    if (!response.ok) { setError(result.error ?? 'We could not unlink the relationship.'); return; }
    setMessage(`Unlinked from ${relationship.counterpartName}. No other record was changed.`);
    router.refresh();
  }

  return <details className="relationship-editor">
    <summary>Edit or unlink</summary>
    <form className="inline-control" onSubmit={save} method="post">
      <select name="relationshipType" aria-label="Relationship" defaultValue={relationship.relationshipType}>{types.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}</select>
      <input name="startDate" type="date" aria-label="Known since" defaultValue={relationship.startDate} />
      <input name="endDate" type="date" aria-label="Ended" defaultValue={relationship.endDate} />
      <input name="notes" placeholder="Notes (optional)" aria-label="Relationship notes" defaultValue={relationship.notes} />
      <label className="checkbox-row"><input type="checkbox" name="isNextOfKin" defaultChecked={relationship.isNextOfKin} /> Next of kin</label>
      <label className="checkbox-row"><input type="checkbox" name="isEmergencyContact" defaultChecked={relationship.isEmergencyContact} /> Emergency contact</label>
      <button className="crm-button crm-button-secondary" disabled={!hydrated || busy}>{busy ? 'Saving…' : 'Save'}</button>
      {error && <span className="form-error" role="status">{error}</span>}
      {message && <span className="form-success" role="status">{message}</span>}
    </form>
    <div className="inline-control">
      {confirming ? <>
        <span className="timeline-meta">Unlink from {relationship.counterpartName}? Their record and this profile are otherwise unchanged.</span>
        <button type="button" className="crm-button crm-button-secondary" disabled={busy} onClick={unlink}>{busy ? 'Unlinking…' : 'Yes, unlink'}</button>
        <button type="button" className="crm-button crm-button-secondary" onClick={() => setConfirming(false)}>Cancel</button>
      </> : <button type="button" className="crm-button crm-button-secondary" onClick={() => setConfirming(true)}>Unlink relationship</button>}
    </div>
  </details>;
}
