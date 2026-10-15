'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useHydrated } from '@/lib/use-hydrated';

/** Common filing categories. The category is free text in the database, so the field accepts
 * anything a team needs while still nudging staff towards the shared vocabulary. */
const CATEGORY_SUGGESTIONS = ['Referral', 'Assessment', 'Support plan', 'Risk assessment', 'Consent', 'Identity', 'Benefits', 'Tenancy', 'Correspondence', 'Compliance'];

/**
 * Files a private document against the service user whose profile it is shown on. The association is
 * always the profile in view — the client id travels with the form, so a file can never be filed
 * against the wrong person by mistake. Uploads land in the same private store as the document
 * register and are audited by the upload API.
 */
export function ClientDocumentUploadForm({ clientId }: { clientId: string }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState('sending'); setMessage('');
    const formElement = event.currentTarget;
    const response = await fetch('/api/crm/documents/upload', { method: 'POST', body: new FormData(formElement) });
    const result = await response.json();
    if (response.ok) { setState('success'); setMessage(`${result.displayName} filed.`); formElement.reset(); router.refresh(); } else { setState('error'); setMessage(result.error ?? 'We could not upload that document.'); }
  }
  return <form id="document-upload" className="form-card" onSubmit={submit} method="post">
    <h2>File a document</h2>
    <p>PDF, PNG, JPG, or TXT files up to 10 MB. The file is stored outside the public web root and linked to this service user.</p>
    {message && <div className={state === 'success' ? 'form-success' : 'form-error'} role="status">{message}</div>}
    <input type="hidden" name="clientId" value={clientId} />
    <div className="form-grid">
      <div className="form-field"><label htmlFor="client-document-file">File</label><input id="client-document-file" name="file" type="file" accept="application/pdf,image/png,image/jpeg,text/plain" required /></div>
      <div className="form-field"><label htmlFor="client-document-category">Category</label><input id="client-document-category" name="category" list="client-document-categories" placeholder="Support plan…" required /><datalist id="client-document-categories">{CATEGORY_SUGGESTIONS.map((category) => <option key={category} value={category} />)}</datalist></div>
      <div className="form-field"><label htmlFor="client-document-date">Document date</label><input id="client-document-date" name="documentDate" type="date" /></div>
      <div className="form-field full"><label htmlFor="client-document-description">Description</label><textarea id="client-document-description" name="description" maxLength={500} placeholder="What this document is, in your own words" /></div>
      <div className="form-field full"><label className="checkbox-row"><input type="checkbox" name="restricted" /> Mark as sensitive for reporting (metadata only — every signed-in staff member can still open and download this file)</label></div>
      <div className="form-field full"><button className="crm-button crm-button-primary" disabled={!hydrated || state === 'sending'}>{state === 'sending' ? 'Filing…' : 'File document'}</button></div>
    </div>
  </form>;
}
