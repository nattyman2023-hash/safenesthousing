'use client';

import { useState } from 'react';

export function ResetPasswordForm({ token }: { token: string }) {
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const values = new FormData(event.currentTarget);
    const password = String(values.get('password') ?? '');
    if (password !== String(values.get('confirm') ?? '')) { setMessage('The passwords do not match.'); setBusy(false); return; }
    const response = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
    const result = await response.json();
    if (response.ok) setSuccess(true); else { setMessage(result.error ?? 'This reset link is invalid or expired.'); setBusy(false); }
  }

  if (success) return <><div className="form-success" role="status">Your password has been updated. You can now sign in.</div><div className="auth-links"><a href="/staff/login">Go to sign in</a></div></>;
  return <form onSubmit={submit}>
    <div className="form-field"><label htmlFor="password">New password</label><div className="password-field"><input id="password" name="password" type={showPassword ? 'text' : 'password'} minLength={12} autoComplete="new-password" required /><button type="button" className="button button-secondary password-toggle" aria-pressed={showPassword} aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide' : 'Show'}</button></div></div>
    <div className="form-field"><label htmlFor="confirm">Confirm password</label><div className="password-field"><input id="confirm" name="confirm" type={showConfirmation ? 'text' : 'password'} minLength={12} autoComplete="new-password" required /><button type="button" className="button button-secondary password-toggle" aria-pressed={showConfirmation} aria-label={showConfirmation ? 'Hide password confirmation' : 'Show password confirmation'} onClick={() => setShowConfirmation((value) => !value)}>{showConfirmation ? 'Hide' : 'Show'}</button></div></div>
    {message && <div className="form-error" role="alert">{message}</div>}
    <button className="button button-primary" disabled={busy}>{busy ? 'Updating...' : 'Update password'}</button>
    <div className="auth-links"><a href="/staff/login">Back to sign in</a></div>
  </form>;
}
