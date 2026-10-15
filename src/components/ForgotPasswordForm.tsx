'use client';

import { useState } from 'react';
import { useHydrated } from '@/lib/use-hydrated';

export function ForgotPasswordForm() {
  const hydrated = useHydrated();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: new FormData(event.currentTarget).get('email') }) });
    setSent(true); setBusy(false);
  }
  if (sent) return <><div className="form-success" role="status">If the account exists, a reset email will arrive shortly.</div><div className="auth-links"><a href="/staff/login">Back to sign in</a></div></>;
  return <form onSubmit={submit} method="post"><div className="form-field"><label htmlFor="email">Work email</label><input id="email" name="email" type="email" autoComplete="username" required /></div><button className="button button-primary" disabled={!hydrated || busy}>{busy ? 'Sending…' : 'Send reset link'}</button><div className="auth-links"><a href="/staff/login">Back to sign in</a></div></form>;
}
