'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function UserInviteForm({ roles }: { roles: { slug: string; name: string }[] }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(''); setError('');
    const formElement = event.currentTarget;
    const response = await fetch('/api/crm/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(formElement).entries())) });
    const result = await response.json();
    if (response.ok) { setMessage('Invitation created. The account holder will receive a password setup link.'); formElement.reset(); router.refresh(); } else setError(result.error ?? 'We could not create the invitation.');
    setBusy(false);
  }
  return <form id="invite" className="form-card" onSubmit={submit}><h2>Invite user</h2><p>New accounts receive a time-limited password setup link and MFA is required for the invited account.</p>{message && <div className="form-success" role="status">{message}</div>}{error && <div className="form-error" role="alert">{error}</div>}<div className="form-grid"><div className="form-field"><label htmlFor="invite-name">Name</label><input id="invite-name" name="name" required /></div><div className="form-field"><label htmlFor="invite-email">Email</label><input id="invite-email" name="email" type="email" required /></div><div className="form-field"><label htmlFor="invite-job">Job title</label><input id="invite-job" name="jobTitle" /></div><div className="form-field"><label htmlFor="invite-role">Role</label><select id="invite-role" name="roleSlug" required>{roles.map((role) => <option key={role.slug} value={role.slug}>{role.name}</option>)}</select></div><div className="form-field full"><button className="crm-button crm-button-primary" disabled={busy}>{busy ? 'Creating…' : 'Create invitation'}</button></div></div></form>;
}
