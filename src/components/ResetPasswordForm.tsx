'use client';

import { useState } from 'react';

export function ResetPasswordForm({ token }: { token: string }) {
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const values = new FormData(event.currentTarget);
    const password = String(values.get('password') ?? '');
    if (password !== String(values.get('confirm') ?? '')) { setMessage('The passwords do not match.'); setBusy(false); return; }
    const response = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
    const result = await response.json();
    if (response.ok) setSuccess(true); else { setMessage(result.error ?? 'This reset link is invalid or expired.'); setBusy(false); }
  }
  if (success) return <><div className="form-success" role="status">Your password has been updated. You can now sign in.</div><div className="auth-links"><a href="/staff/login">Go to sign in</a></div></>;
  return <form onSubmit={submit}><div className="form-field"><label htmlFor="password">New password</label><input id="password" name="password" type="password" minLength={12} autoComplete="new-password" required /></div><div className="form-field"><label htmlFor="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" minLength={12} autoComplete="new-password" required /></div>{message && <div className="form-error" role="alert">{message}</div>}<button className="button button-primary" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button><div className="auth-links"><a href="/staff/login">Back to sign in</a></div></form>;
}
