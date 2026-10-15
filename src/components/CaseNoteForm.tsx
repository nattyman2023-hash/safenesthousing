'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CONTACT_DIRECTIONS, CONTACT_METHODS } from '@/lib/contact-tracking';
import { useHydrated } from '@/lib/use-hydrated';

const methodLabels: Record<string, string> = { IN_PERSON: 'In person', HOME_VISIT: 'Home visit', OFFICE_VISIT: 'Office visit', PHONE: 'Phone call', VIDEO: 'Video call', TEXT: 'Text message', EMAIL: 'Email', LETTER: 'Letter', OTHER: 'Other' };

/**
 * Records a case note, or a contact when the contact fields are filled in. The two are one stored row:
 * choosing a way of keeping in touch, or flagging an attempted, unsuccessful or unsupported contact, is
 * what makes the note count as a contact for planned-contact compliance, so the same conversation is
 * never logged twice.
 */

export function CaseNoteForm({ clientId }: { clientId: string }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState('sending'); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = Object.fromEntries(form.entries()) as Record<string, unknown>;
    // The two "did not happen" flags are checkboxes, and an unchecked box sends nothing at all, so they
    // are translated here into the explicit values the API expects.
    delete payload.contactDidNotGoAhead;
    delete payload.notCountedAsSupport;
    if (form.get('contactDidNotGoAhead') === 'on') payload.completed = false;
    if (form.get('notCountedAsSupport') === 'on') payload.meaningful = false;
    const response = await fetch(`/api/crm/clients/${clientId}/case-notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (response.ok) { setState('success'); setMessage(result.countedAsSupport ? 'Saved and counted as support contact.' : 'Saved as a case note.'); formElement.reset(); router.refresh(); } else { setState('error'); setMessage(result.error ?? 'We could not save the case note.'); }
  }
  return <form id="case-note" className="form-card" onSubmit={submit} method="post"><h2>Add case note or contact</h2><p>Notes are finalised on save and the original content is retained in the version history. Fill in the contact details to have the note counted towards planned contact.</p>{message && <div className={state === 'success' ? 'form-success' : 'form-error'} role="status">{message}</div>}<div className="form-grid"><div className="form-field"><label htmlFor="contactType">Contact type</label><input id="contactType" name="contactType" placeholder="Key work session" required /></div><div className="form-field"><label htmlFor="category">Category</label><input id="category" name="category" placeholder="Housing, wellbeing…" required /></div><div className="form-field"><label htmlFor="occurredAt">When</label><input id="occurredAt" name="occurredAt" type="datetime-local" /></div><div className="form-field"><label htmlFor="method">Way of keeping in touch</label><select id="method" name="method" defaultValue=""><option value="">Not a contact — case note only</option>{CONTACT_METHODS.map((method) => <option key={method} value={method}>{methodLabels[method] ?? method}</option>)}</select></div><div className="form-field"><label htmlFor="direction">Direction</label><select id="direction" name="direction" defaultValue=""><option value="">Not recorded</option>{CONTACT_DIRECTIONS.map((direction) => <option key={direction} value={direction}>{direction === 'OUTBOUND' ? 'We made contact' : 'They made contact'}</option>)}</select></div><div className="form-field"><label htmlFor="durationMinutes">Minutes of contact</label><input id="durationMinutes" name="durationMinutes" type="number" min={0} max={1440} step={1} /></div><div className="form-field full"><label htmlFor="note">Note</label><textarea id="note" name="note" required /></div><div className="form-field full"><label className="checkbox-row"><input type="checkbox" name="attempted" /> Attempted contact — I could not reach the person</label></div><div className="form-field full"><label className="checkbox-row"><input type="checkbox" name="contactDidNotGoAhead" /> The contact did not go ahead</label></div><div className="form-field full"><label className="checkbox-row"><input type="checkbox" name="notCountedAsSupport" /> Do not count this towards planned contact</label></div><div className="form-field"><label htmlFor="outcome">Outcome</label><input id="outcome" name="outcome" /></div><div className="form-field"><label htmlFor="followUpDate">Follow-up date</label><input id="followUpDate" name="followUpDate" type="date" /></div><div className="form-field full"><label className="checkbox-row"><input type="checkbox" name="restricted" /> Restricted note</label></div><div className="form-field full"><button className="crm-button crm-button-primary" disabled={!hydrated || state === 'sending'}>{state === 'sending' ? 'Saving…' : 'Save case note'}</button></div></div></form>;
}
