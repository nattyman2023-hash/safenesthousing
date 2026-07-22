'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const response = await fetch('/api/auth/login', { method: 'POST', body: new FormData(event.currentTarget) });
    const result = await response.json();
    if (response.ok) router.push(result.mfaRequired ? `/staff/mfa${result.mfaConfigured ? '' : '?setup=1'}` : '/crm/dashboard');
    else { setError(result.error ?? 'Sign in failed.'); setBusy(false); }
  }

  return <form onSubmit={submit}>
    <div className="form-field"><label htmlFor="email">Work email</label><input id="email" name="email" type="email" autoComplete="username" required /></div>
    <div className="form-field"><label htmlFor="password">Password</label><div className="password-field"><input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required /><button type="button" className="button button-secondary password-toggle" aria-pressed={showPassword} aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide' : 'Show'}</button></div></div>
    {error && <div className="form-error" role="alert">{error}</div>}
    <button className="button button-primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Signing in...' : 'Sign in securely'}</button>
    <div className="auth-links"><Link href="/staff/forgot-password">Forgot password?</Link><Link href="/">Return to website</Link></div>
  </form>;
}
