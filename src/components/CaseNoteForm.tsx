'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function CaseNoteForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState('sending'); setMessage('');
    const formElement = event.currentTarget;
    const response = await fetch(`/api/crm/clients/${clientId}/case-notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(formElement).entries())) });
    const result = await response.json();
    if (response.ok) { setState('success'); setMessage('Case note saved and versioned.'); formElement.reset(); router.refresh(); } else { setState('error'); setMessage(result.error ?? 'We could not save the case note.'); }
  }
  return <form id="case-note" className="form-card" onSubmit={submit}><h2>Add case note</h2><p>Notes are finalised on save and the original content is retained in the version history.</p>{message && <div className={state === 'success' ? 'form-success' : 'form-error'} role="status">{message}</div>}<div className="form-grid"><div className="form-field"><label htmlFor="contactType">Contact type</label><input id="contactType" name="contactType" placeholder="Key work session" required /></div><div className="form-field"><label htmlFor="category">Category</label><input id="category" name="category" placeholder="Housing, wellbeing…" required /></div><div className="form-field full"><label htmlFor="note">Note</label><textarea id="note" name="note" required /></div><div className="form-field"><label htmlFor="outcome">Outcome</label><input id="outcome" name="outcome" /></div><div className="form-field"><label htmlFor="followUpDate">Follow-up date</label><input id="followUpDate" name="followUpDate" type="date" /></div><div className="form-field full"><label className="checkbox-row"><input type="checkbox" name="restricted" /> Restricted note</label></div><div className="form-field full"><button className="crm-button crm-button-primary" disabled={state === 'sending'}>{state === 'sending' ? 'Saving…' : 'Save case note'}</button></div></div></form>;
}
