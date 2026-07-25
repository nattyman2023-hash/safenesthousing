'use client';

import { useState } from 'react';

export function EmailitSettingsForm({ configured }: { configured: boolean }) {
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(''); setError('');
    const response = await fetch('/api/crm/email-settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey }) });
    const result = await response.json();
    if (response.ok) { setApiKey(''); setMessage('Emailit API key saved securely.'); } else setError(result.error ?? 'We could not save the Emailit API key.');
    setBusy(false);
  }

  return <form className="form-grid" onSubmit={submit}>{message && <div className="form-success" role="status" style={{ gridColumn: '1 / -1' }}>{message}</div>}{error && <div className="form-error" role="alert" style={{ gridColumn: '1 / -1' }}>{error}</div>}<div className="form-field full"><label htmlFor="emailit-api-key">Emailit API key</label><input id="emailit-api-key" name="apiKey" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="new-password" placeholder={configured ? 'Saved key — enter a new key to replace it' : 'Enter the Emailit API key'} required /><small>{configured ? 'A key is already stored. The saved key is never displayed.' : 'The key is encrypted before it is stored and is never shown again.'}</small></div><div className="form-field full"><button className="crm-button crm-button-primary" disabled={busy}>{busy ? 'Saving…' : configured ? 'Replace Emailit API key' : 'Save Emailit API key'}</button></div></form>;
}
