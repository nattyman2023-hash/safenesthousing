'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DocumentUploadForm() {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState('sending'); setMessage('');
    const formElement = event.currentTarget;
    const response = await fetch('/api/crm/documents/upload', { method: 'POST', body: new FormData(formElement) });
    const result = await response.json();
    if (response.ok) { setState('success'); setMessage(`${result.displayName} uploaded.`); formElement.reset(); router.refresh(); } else { setState('error'); setMessage(result.error ?? 'We could not upload that document.'); }
  }
  return <form id="upload" className="form-card" onSubmit={submit}><h2>Upload a private document</h2><p>PDF, PNG, JPG, or TXT files up to 10 MB. Files remain outside the public web root.</p>{message && <div className={state === 'success' ? 'form-success' : 'form-error'} role="status">{message}</div>}<div className="form-grid"><div className="form-field"><label htmlFor="document-file">File</label><input id="document-file" name="file" type="file" accept="application/pdf,image/png,image/jpeg,text/plain" required /></div><div className="form-field"><label htmlFor="document-category">Category</label><input id="document-category" name="category" placeholder="Compliance, support plan…" required /></div><div className="form-field full"><label className="checkbox-row"><input type="checkbox" name="restricted" /> Restrict to safeguarding and senior support roles</label></div><div className="form-field full"><button className="crm-button crm-button-primary" disabled={state === 'sending'}>{state === 'sending' ? 'Uploading…' : 'Upload document'}</button></div></div></form>;
}
