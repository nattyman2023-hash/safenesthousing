'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function MfaForm({ setup }: { setup: boolean }) {
  const router = useRouter();
  const [secret, setSecret] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'sending' | 'recovery' | 'error'>(setup ? 'loading' : 'ready');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!setup) return;
    fetch('/api/auth/mfa/setup', { method: 'POST' }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) { setState('error'); setMessage(result.error === 'AUTH_REQUIRED' ? 'Your sign-in has expired. Please sign in again.' : 'MFA setup could not be started.'); return; }
      setSecret(result.secret); setState('ready');
    }).catch(() => { setState('error'); setMessage('MFA setup could not be started.'); });
  }, [setup]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState('sending'); setMessage('');
    const response = await fetch('/api/auth/mfa/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: new FormData(event.currentTarget).get('code') }) });
    const result = await response.json();
    if (response.ok) {
      if (Array.isArray(result.recoveryCodes) && result.recoveryCodes.length) { setRecoveryCodes(result.recoveryCodes); setState('recovery'); }
      else router.push('/crm/dashboard');
    } else { setState('error'); setMessage(result.error ?? 'That authentication or recovery code was not accepted.'); }
  }

  return <>{setup && <div className="form-success" role="status">{state === 'loading' ? 'Preparing secure setup...' : <>Add this secret to your authenticator app: <strong>{secret}</strong></>}</div>}{message && <div className="form-error" role="alert">{message}</div>}{state === 'recovery' ? <div className="form-success" role="status"><h3>Save your recovery codes</h3><p>Store these codes somewhere private. Each code works once if you cannot use your authenticator app.</p><p style={{ wordBreak: 'break-word', letterSpacing: 1.5 }}><strong>{recoveryCodes.join(' · ')}</strong></p><button type="button" className="button button-primary" onClick={() => router.push('/crm/dashboard')}>Continue to Safe Nest</button></div> : <form onSubmit={submit}><div className="form-field"><label htmlFor="code">Authenticator or recovery code</label><input id="code" name="code" inputMode="text" maxLength={20} autoComplete="one-time-code" required /><small>Enter the six-digit code from your app, or one of your recovery codes.</small></div><button className="button button-primary" disabled={state === 'loading' || state === 'sending'}>{state === 'sending' ? 'Verifying...' : 'Verify code'}</button><div className="auth-links"><a href="/staff/login">Back to sign in</a></div></form>}</>;
}
